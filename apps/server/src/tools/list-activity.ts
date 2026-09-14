import { advertisedMcpTool, ListActivityInputSchema, ListActivitySuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listGraphActivity } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerListActivityTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "list_activity",
    description: advertisedMcpTool("list_activity").description,
    input: ListActivityInputSchema.shape,
    output: ListActivitySuccessSchema,
    handler: async (input) => listGraphActivity(pool, input),
  });
}
