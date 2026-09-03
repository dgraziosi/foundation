import { UpsertInputSchema, UpsertSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { upsertGraphNode } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerUpsertTool(
  server: McpServer,
  pool: Pool,
  dataDir: string,
  agent: AgentPrincipal,
): void {
  defineTool(server, {
    name: "upsert",
    description:
      "Create or update a node (title, type, payload, data, status). Updates require base_updated_at (if-match). data JSONB-merges and is checked against the type json_schema. url { system, id } is unique on live nodes (gmail | calendar | drive). url: null clears that identity. Search { url } finds it. data.url is an optional https address (no credentials); that string is not unique and is not which Drive / Gmail / Calendar object. data.repo.{system,id} is unique on live nodes (github). repo: null clears. data.receipt.{system,id,kind} is unique on live nodes (done: gmail/sent or calendar/cleared). receipt: null clears. The server does not invent the receipt. Optional data.aliases is a user-authored string array (pass aliases: [] to clear; omit the key to leave aliases unchanged; punctuation-only values refuse and do not clear). Create (no id) runs the same lookup matcher: exact title or unique exact alias returns those candidates and does not write unless allow_duplicate is true. Token/fuzzy/compact matches warn and do not block. Create accepts idempotency_key. Activity actor is the key that authenticated. Returns suggested_links (child_of / about / relates_to) from title FTS — proposals only; call link after the user accepts.",
    input: UpsertInputSchema.shape,
    output: UpsertSuccessSchema,
    handler: async (input) => upsertGraphNode(pool, input, { dataDir }, writeContextOf(agent)),
  });
}
