import {
  advertisedMcpTool,
  ManageRelationInputSchema,
  ManageRelationSuccessSchema,
} from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { manageRelation } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerManageRelationTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "manage_relation",
    description: advertisedMcpTool("manage_relation").description,
    input: ManageRelationInputSchema.shape,
    output: ManageRelationSuccessSchema,
    handler: async (input) => manageRelation(pool, input, writeContextOf(agent)),
  });
}
