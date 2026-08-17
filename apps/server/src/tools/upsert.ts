import { UpsertInputSchema, UpsertSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertGraphNode } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerUpsertTool(server: McpServer, pool: Pool, dataDir: string): void {
  defineTool(server, {
    name: "upsert",
    description:
      "Create or update a node (title, type, payload, data, status). Updates require base_updated_at (if-match). data JSONB-merges and is checked against the type json_schema. data.origin.{system,id} is unique on live nodes. Optional data.aliases is an operator-authored string array (pass aliases: [] to clear; omit the key to leave aliases unchanged). Create (no id) runs the same lookup matcher: exact title or unique exact alias returns those candidates and does not write unless allow_duplicate is true. Token/fuzzy/compact matches warn and do not block. Create accepts idempotency_key. Optional actor / actor_label are stored on activity. Returns suggested_links (child_of / about / relates_to) from title FTS — proposals only; call link after the operator accepts.",
    input: UpsertInputSchema.shape,
    output: UpsertSuccessSchema,
    handler: async (input) => upsertGraphNode(pool, input, { dataDir }),
  });
}
