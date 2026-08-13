import { MutationOkSchema, UndoInputSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { undoGraphActivity } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerUndoTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "undo",
    description:
      "Reverse a reversible activity row by id. Requires confirm: true. Undoing a type create while deleted nodes of that type remain requires purge_deleted: true.",
    input: UndoInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => undoGraphActivity(pool, input),
  });
}
