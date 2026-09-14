import { advertisedMcpTool, MutationOkSchema, UndoInputSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { undoGraphActivity } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerUndoTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "undo",
    description: advertisedMcpTool("undo").description,
    input: UndoInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => undoGraphActivity(pool, input, writeContextOf(agent)),
  });
}
