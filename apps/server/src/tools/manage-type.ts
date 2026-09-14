import { advertisedMcpTool, ManageTypeInputSchema, ManageTypeSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { manageType } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerManageTypeTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "manage_type",
    description: advertisedMcpTool("manage_type").description,
    input: ManageTypeInputSchema.shape,
    output: ManageTypeSuccessSchema,
    handler: async (input) => manageType(pool, input, writeContextOf(agent)),
  });
}
