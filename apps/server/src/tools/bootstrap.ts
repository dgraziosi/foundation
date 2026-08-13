import { listNodeTypes, listRelationTypes, type Pool } from "@foundation/db";
import {
  BootstrapOutputSchema,
  SPINE_DIAGRAM,
  type BootstrapOutput,
} from "@foundation/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defineTool } from "./define-tool.js";

export async function buildBootstrap(pool: Pool): Promise<BootstrapOutput> {
  const [types, relations] = await Promise.all([listNodeTypes(pool), listRelationTypes(pool)]);
  return BootstrapOutputSchema.parse({
    spine: {
      diagram: SPINE_DIAGRAM,
      root: "area",
      description:
        "Area is the vault root (life domain + what you value). Place work with child_of: project → area, goal → project, habit|task → goal. Identity is UUID; edges are the only source of truth.",
    },
    types,
    relations,
    rules: {
      identity: "uuid",
      payloads:
        "Typed payloads: media_type text/markdown | text/html | application/json | text/plain | …; storage inline | blob. HTML itineraries belong on the node, not round-tripped through markdown.",
      destructive_confirm: true,
      ontology_writable: true,
      no_proposal_inbox: true,
      edges_are_source_of_truth: true,
      hierarchy_relation: "child_of",
    },
    how_to_extend: {
      summary:
        "You may manage_type and manage_relation without approval. Changes apply immediately. Safety is the activity log + undo — there is no proposal inbox. Destructive tools (delete, unlink, undo) require confirm: true. Identity is UUID. Call inspect_ontology to see system + authored types. After mutating, list_activity to read receipts and undo to invert a reversible row. search finds nodes by title and inline payload text (HTML tags stripped). Vault-keeping (instance + graph health) is an operator routine, not an MCP tool.",
      manage_type:
        "Create or update a node type (slug, kind spine|artifact, parent_types, optional json_schema for nodes.data). Applies immediately. System slugs: you may update description only; you cannot delete them. After creating a type, upsert a node with that type. Set parent_types to allow child_of placement under those parents.",
      manage_relation:
        "Create or update a relation type (slug, kind hierarchy|associative, source_types, target_types, symmetry). Empty source/target lists mean any type. Applies immediately. System relations: description only.",
      nodes:
        "upsert creates or updates by UUID (omit id to create). Payload is typed: text/markdown, text/html, application/json, text/plain (inline). HTML itineraries belong on the node — do not round-trip through markdown. get returns the node plus incident edges. delete is a soft-delete and requires confirm: true. Undo of delete restores the node (incident edges were kept).",
      links:
        "link validates then writes the edges table (the only source of truth for hierarchy and associations). child_of is the hierarchy verb; at most one per source; allowed parents come from the source type's parent_types. relates_to that fits the spine suggests child_of — it does not silently rewrite unless you pass upgrade: true. unlink requires confirm: true. get and link ignore edges whose endpoints are deleted; reparenting drops a stale child_of to a deleted parent and records an unlink activity row.",
      activity:
        "list_activity filters by action, target (target_id), and since. Every mutation writes a row with before/after snapshots. undo inverts a reversible row by id and requires confirm: true. Tokens are single-use (undone_at); expired tokens refuse. Undo of undo writes a compensating row with reversible = false. Undoing a type create while deleted nodes of that type remain requires purge_deleted: true (otherwise restore those nodes first via undo of their deletes).",
      search:
        "search uses Postgres full-text search on title plus extracted inline payload text (HTML tags stripped; JSON stringified). Filter by type. Soft-deleted nodes are excluded. This is lexical recall — search the itinerary back — not embeddings.",
    },
  });
}

export function registerBootstrapTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "bootstrap",
    description:
      "Return starter ontology, how to extend it, and current type/relation inventory. Call first.",
    input: {},
    output: BootstrapOutputSchema,
    handler: async () => buildBootstrap(pool),
  });
}
