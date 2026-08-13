import { DeleteInputSchema, MutationOkSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteGraphNode } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerDeleteTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "delete",
    description: "Soft-delete a node. Requires confirm: true.",
    input: DeleteInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => deleteGraphNode(pool, input),
  });
}
