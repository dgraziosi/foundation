import { advertisedMcpTool, LookupInputSchema, LookupSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { lookupGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerLookupTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "lookup",
    description: advertisedMcpTool("lookup").description,
    input: LookupInputSchema.shape,
    output: LookupSuccessSchema,
    handler: async (input) => lookupGraphNodes(pool, input),
  });
}
