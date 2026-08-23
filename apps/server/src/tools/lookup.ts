import { LookupInputSchema, LookupSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lookupGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerLookupTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "lookup",
    description:
      "Resolve one or more entity names to live nodes. Returns a result per input (exact, alias, candidate, ambiguous, or no_match). Unique UUID, unique folded title, or unique user alias may bind a UUID. Token and fuzzy matches are candidates only — ask the user to confirm a UUID before any mutation that depends on the identity. get is safe for inspection. Each useful candidate includes id, type, canonical title, updated_at, match, and confidence, plus the surrounding candidates list. confidence ranks; it is not a probability and does not authorize a write. Read-only: never writes, merges, or picks an ambiguous candidate. If you already have a UUID, call get. For listing, url, repo, receipt, or payload search, use search.",
    input: LookupInputSchema.shape,
    output: LookupSuccessSchema,
    handler: async (input) => lookupGraphNodes(pool, input),
  });
}
