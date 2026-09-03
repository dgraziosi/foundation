import { MutationOkSchema, UndoInputSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { undoGraphActivity } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerUndoTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "undo",
    description:
      "Reverse a reversible activity row by id. Needs a key with destructive scope. Undoing a type create while deleted nodes of that type remain requires purge_deleted: true. Undo of type retire restores the registry row.",
    input: UndoInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => undoGraphActivity(pool, input, writeContextOf(agent)),
  });
}
