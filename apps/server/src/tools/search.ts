import { SearchInputSchema, SearchSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerSearchTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "search",
    description: "Find nodes by text query and optional type filter.",
    input: SearchInputSchema.shape,
    output: SearchSuccessSchema,
    handler: async (input) => searchGraphNodes(pool, input),
  });
}
