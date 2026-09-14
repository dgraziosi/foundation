import {
  advertisedMcpTool,
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
    description: advertisedMcpTool("search").description,
    input: SearchInputSchema.shape,
    listed: SearchInputListedSchema.shape,
    wire: SearchInputWireSchema,
    output: SearchSuccessSchema,
    handler: async (input) => searchGraphNodes(pool, input),
  });
}
