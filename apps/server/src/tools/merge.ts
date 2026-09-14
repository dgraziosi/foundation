import { advertisedMcpTool, MergeInputSchema, MutationOkSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { mergeGraphNodes } from "../merge.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerMergeTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "merge",
    description: advertisedMcpTool("merge").description,
    input: MergeInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => mergeGraphNodes(pool, input, writeContextOf(agent)),
  });
}
