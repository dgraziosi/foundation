import { ManageTypeInputSchema, ManageTypeSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageType } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerManageTypeTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "manage_type",
    description: "Create or update a node type. Applies immediately.",
    input: ManageTypeInputSchema.shape,
    output: ManageTypeSuccessSchema,
    handler: async (input) => manageType(pool, input),
  });
}
