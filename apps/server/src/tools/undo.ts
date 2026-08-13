import { MutationOkSchema, UndoInputSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { undoGraphActivity } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerUndoTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "undo",
    description: "Reverse a reversible activity row by id. Requires confirm: true.",
    input: UndoInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => undoGraphActivity(pool, input),
  });
}
