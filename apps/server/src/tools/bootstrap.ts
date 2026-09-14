import { listNodeTypes, listRelationTypes, type Pool } from "@foundation/db";
import {
  advertisedMcpTool,
  BootstrapOutputSchema,
  hierarchySlug,
  SPINE_DIAGRAM,
  type BootstrapOutput,
} from "@foundation/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export async function buildBootstrap(pool: Pool, agent: AgentPrincipal): Promise<BootstrapOutput> {
  const [types, relations] = await Promise.all([listNodeTypes(pool), listRelationTypes(pool)]);
  return BootstrapOutputSchema.parse({
    spine: {
      diagram: SPINE_DIAGRAM,
      root: "area",
      description:
        "Area is the spine root (life domain + what you value). The spine (area → project → goal → habit | task) is preferred placement, not a hard gate: project → area, goal → project, habit prefers a goal parent but does not need one, task → goal or project (prefer goal when there is a real outcome; task cannot child_of area). A lesson or decision may hang under area, project, or goal and does not need that parent. Identity is UUID; edges are the only source of truth.",
    },
    types,
    relations,
    rules: {
      identity: "uuid",
      payloads:
        "Typed payloads: media_type text/markdown | text/html | application/json | text/plain | …; storage inline | blob. HTML itineraries belong on the node, not round-tripped through markdown. Large files use storage blob (blob_id); fetch bytes via HTTP GET /blobs/:id.",
      destructive_scope: agent.destructive,
      actor_label: agent.actor_label,
      ontology_writable: true,
      no_proposal_inbox: true,
      edges_are_source_of_truth: true,
      hierarchy_relation: hierarchySlug(relations) ?? "child_of",
    },
  });
}

export function registerBootstrapTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "bootstrap",
    description: advertisedMcpTool("bootstrap").description,
    input: {},
    output: BootstrapOutputSchema,
    handler: async () => buildBootstrap(pool, agent),
  });
}
