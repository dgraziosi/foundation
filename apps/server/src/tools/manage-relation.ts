import {
  ManageRelationInputSchema,
  ManageRelationSuccessSchema,
} from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageRelation } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerManageRelationTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "manage_relation",
    description: "Create or update a relation type. Applies immediately.",
    input: ManageRelationInputSchema.shape,
    output: ManageRelationSuccessSchema,
    handler: async (input) => manageRelation(pool, input),
  });
}
