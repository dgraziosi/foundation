import { GetInputSchema, GetSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGraphNode } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerGetTool(server: McpServer, pool: Pool, dataDir: string): void {
  defineTool(server, {
    name: "get",
    description:
      "Fetch a node by id, including payload, incident edges with neighbor titles, and suggested_links from title FTS when a live neighbor looks related. Suggestions never write an edge.",
    input: GetInputSchema.shape,
    output: GetSuccessSchema,
    handler: async (input) =>
      getGraphNode(pool, input.id, {
        include_body: input.include_body,
        blobs: { dataDir },
      }),
  });
}
