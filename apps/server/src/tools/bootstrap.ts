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
        "Area is the spine root (life domain + what you value). Place work with child_of: project → area, goal → project, habit|task → goal. Identity is UUID; edges are the only source of truth.",
    },
    types,
    relations,
    rules: {
      identity: "uuid",
      payloads:
        "Typed payloads: media_type text/markdown | text/html | application/json | text/plain | …; storage inline | blob. HTML itineraries belong on the node, not round-tripped through markdown. Large files use storage blob (blob_id); fetch bytes via HTTP GET /blobs/:id.",
      destructive_confirm: true,
      ontology_writable: true,
      no_proposal_inbox: true,
      edges_are_source_of_truth: true,
      hierarchy_relation: "child_of",
    },
    how_to_extend: {
      summary:
        "You may manage_type and manage_relation without approval. Changes apply immediately. Safety is the activity log + undo — there is no proposal inbox. Destructive tools (delete, unlink, undo) require confirm: true. Identity is UUID. If you already have a UUID, call get — do not search. Call inspect_ontology to see system + authored types. After mutating, list_activity to read receipts and undo to invert a reversible row. search finds nodes by title, node data, and extracted inline payload text. An empty search is not a license to upsert a duplicate. Large files are blobs under FOUNDATION_DATA/blobs, ingested via upsert (bytes_base64 or uploads source_path). Vault health, graph hygiene, and applying Foundation git updates are Librarian operator routines, not MCP tools. Do not add get_vault_health. Do not commit personal life data, documents, or secrets to git — those belong in the operator's vault.",
      manage_type:
        "Create or update a node type (slug, kind spine|artifact, parent_types, optional json_schema for nodes.data). Applies immediately. System slugs: you may update description only; you cannot delete them. After creating a type, upsert a node with that type. Set parent_types to allow child_of placement under those parents.",
      manage_relation:
        "Create or update a relation type (slug, kind hierarchy|associative, source_types, target_types, symmetry). Empty source/target lists mean any type. Applies immediately. System relations: description only.",
      nodes:
        "upsert creates or updates by UUID (omit id to create). Updates require base_updated_at matching the node's current updated_at from get (if-match). Mismatch or omit → { error, suggestion }: get and retry. This is lost-update protection, not a write-ACL. data JSONB-merges on update (top-level keys); a partial data patch does not wipe other keys. When the type has json_schema, upsert validates the merged data and returns { error, suggestion } on a miss. data.origin.{system,id} (gmail | calendar | drive | github) is unique on live nodes — search origin before upserting a person so you do not twin. Foundation stores the ref only; never fetch or mirror those systems' bodies. Create accepts idempotency_key so a retried create returns the existing node instead of a twin. Optional actor / actor_label are stored on the activity row (who wrote). Payload is typed: text/markdown, text/html, application/json, text/plain (inline), or storage blob for large files. Blob ingest: payload.bytes_base64 (cap 20MB) or payload.source_path under FOUNDATION_DATA/uploads (server moves the file into blobs/<uuid>). Stored payload is { storage: blob, blob_id, media_type } — get does not dump bytes; fetch with HTTP GET /blobs/:id (API key) or get include_body for small blobs. HTML itineraries belong on the node — do not round-trip through markdown. get returns the node plus incident edges; each edge includes neighbor { id, title, type } so you do not hop UUID-only. delete is a soft-delete and requires confirm: true; it does not delete blob bytes (undo can restore the node). Undo of delete restores the node (incident edges were kept).",
      links:
        "link validates then writes the edges table (the only source of truth for hierarchy and associations). from_base_updated_at and to_base_updated_at are required if-match against each endpoint's updated_at from get; stale or missing → { error, suggestion }. Optional actor / actor_label are stored on the activity row. child_of is the hierarchy verb; at most one per source; allowed parents come from the source type's parent_types. relates_to that fits the spine suggests child_of — it does not silently rewrite unless you pass upgrade: true. unlink requires confirm: true. get and link ignore edges whose endpoints are deleted; reparenting drops a stale child_of to a deleted parent and records an unlink activity row.",
      activity:
        "list_activity filters by action, target (target_id), and since. Every mutation writes a row with before/after snapshots and optional actor / actor_label (who wrote — not a permission gate). undo inverts a reversible row by id and requires confirm: true. Tokens are single-use (undone_at); expired tokens refuse. Undo of undo writes a compensating row with reversible = false. Undoing a type create while deleted nodes of that type remain requires purge_deleted: true (otherwise restore those nodes first via undo of their deletes).",
      search:
        "search uses Postgres full-text search on title, node data (string values), and extracted inline payload text (HTML tags stripped; alt/title/aria-label kept; JSON string values, not the payload wrapper). Latin diacritics are folded so ASCII queries match accented tokens and vice versa (fiancee / fiancée). query is optional when type, status, under (child_of parent UUID), since, or origin is set — list all open tasks with type=task and status=active; list children with under; look up a Gmail/Calendar/Drive/GitHub ref with origin without a word. There is no list_nodes tool. Filter by type. Soft-deleted nodes are excluded. Hits are id/type/title/snippet — call get to load payload and neighbor titles. If you already have a UUID, call get; do not search. An empty lexical result is not a license to upsert a duplicate — try a shorter token or type filter; only upsert if the entity is new. An origin miss means you may upsert with that data.origin (ref only; do not fetch or mirror those systems' bodies). Lexical recall only, not embeddings.",
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
