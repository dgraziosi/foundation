import { ManageTypeInputSchema, ManageTypeSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageType } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerManageTypeTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "manage_type",
    description:
      "Create, update, or retire a node type (fields + view declarations + hue/glyph). Applies immediately. System types may edit description, fields, hue, glyph, and filter/sort/group on existing view ids. Retire requires confirm: true and refuses system types or types with live nodes. Soft-deleted nodes of that type need purge_deleted: true (same as undo of type create).",
    input: ManageTypeInputSchema.shape,
    output: ManageTypeSuccessSchema,
    handler: async (input) => manageType(pool, input),
  });
}
