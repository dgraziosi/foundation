import { LinkInputSchema, LinkSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { linkGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerLinkTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "link",
    description:
      "Create a typed edge after validation. Requires from_base_updated_at and to_base_updated_at (if-match). Optional actor / actor_label are stored on activity.",
    input: LinkInputSchema.shape,
    output: LinkSuccessSchema,
    handler: async (input) => linkGraphNodes(pool, input),
  });
}
