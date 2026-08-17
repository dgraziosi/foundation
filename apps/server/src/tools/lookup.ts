import { LookupInputSchema, LookupSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lookupGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerLookupTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "lookup",
    description:
      "Resolve one or more entity names to live nodes. Returns a result per input (exact, alias, candidate, ambiguous, or no_match). Unique UUID, unique folded title, or unique operator alias may bind a UUID. Token and fuzzy matches are candidates only — ask the operator to confirm a UUID before any mutation that depends on the identity. get is safe for inspection. score is a ranking value, not a probability. Read-only: never writes. If you already have a UUID, call get. For listing, origin refs, or payload search, use search.",
    input: LookupInputSchema.shape,
    output: LookupSuccessSchema,
    handler: async (input) => lookupGraphNodes(pool, input),
  });
}
