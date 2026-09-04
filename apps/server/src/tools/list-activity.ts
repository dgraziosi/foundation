import { ListActivityInputSchema, ListActivitySuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listGraphActivity } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerListActivityTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "list_activity",
    description: "Read the activity log (filter by action, target, since). Optional fields and diff_only.",
    input: ListActivityInputSchema.shape,
    output: ListActivitySuccessSchema,
    handler: async (input) => listGraphActivity(pool, input),
  });
}
