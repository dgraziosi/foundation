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
        "You may manage_type and manage_relation without approval. Changes apply immediately. Safety is the activity log + undo — there is no proposal inbox. Destructive tools (delete, unlink, undo) require confirm: true.",
      manage_type:
        "Create or update a node type (slug, kind spine|artifact, parent_types, optional json_schema for nodes.data).",
      manage_relation:
        "Create or update a relation type (slug, kind hierarchy|associative, source_types, target_types, symmetry). Empty source/target lists mean any type.",
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
