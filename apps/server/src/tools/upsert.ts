import { UpsertInputSchema, UpsertSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertGraphNode } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerUpsertTool(server: McpServer, pool: Pool, dataDir: string): void {
  defineTool(server, {
    name: "upsert",
    description:
      "Create or update a node (title, type, payload, data, status). Updates require base_updated_at (if-match). data JSONB-merges and is checked against the type json_schema. data.origin.{system,id} is unique on live nodes. Create accepts idempotency_key. Optional actor / actor_label are stored on activity.",
    input: UpsertInputSchema.shape,
    output: UpsertSuccessSchema,
    handler: async (input) => upsertGraphNode(pool, input, { dataDir }),
  });
}
