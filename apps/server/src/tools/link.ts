import { LinkInputSchema, LinkSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { linkGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerLinkTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "link",
    description:
      "Create typed edges after validation. Pass one edge (from_id, to_id, relation_type) or edges[] (1–20), not both. The whole batch validates, then one transaction writes all or none. Each edge requires from_base_updated_at and to_base_updated_at (if-match); shared nodes use one agreed timestamp. Optional actor / actor_label are stored on each activity row. Returns links[] (one receipt per edge). The one-edge form also returns edge and activity_id.",
    input: LinkInputSchema.shape,
    output: LinkSuccessSchema,
    handler: async (input) => linkGraphNodes(pool, input),
  });
}
