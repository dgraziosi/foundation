import { UpsertInputSchema, UpsertSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertGraphNode } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerUpsertTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "upsert",
    description: "Create or update a node (title, type, payload, data, status).",
    input: UpsertInputSchema.shape,
    output: UpsertSuccessSchema,
    handler: async (input) => upsertGraphNode(pool, input),
  });
}
