import {
  SearchInputListedSchema,
  SearchInputSchema,
  SearchInputWireSchema,
  SearchSuccessSchema,
} from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerSearchTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "search",
    description:
      "Find nodes by text query and optional filters (type, status, under, since, url, repo, receipt, due overdue|today, due_on_or_before, due_on_or_after, data_equals). Query is optional when a filter is set. Hits include data.due when present. search { url } looks up a Gmail, Calendar, or Drive object, then get. search { repo } looks up a GitHub object, then get. search { receipt } looks up a sent-mail or cleared-event receipt, then get. If you already have a UUID, call get. To resolve one or more entity names to UUIDs, call lookup — do not serial-search. Link is the edge tool, not a search filter.",
    input: SearchInputSchema.shape,
    listed: SearchInputListedSchema.shape,
    wire: SearchInputWireSchema,
    output: SearchSuccessSchema,
    handler: async (input) => searchGraphNodes(pool, input),
  });
}
