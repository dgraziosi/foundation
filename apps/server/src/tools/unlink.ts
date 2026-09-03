import { MutationOkSchema, UnlinkInputSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { unlinkGraphNodes } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerUnlinkTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "unlink",
    description:
      "Remove a typed edge. Requires confirm: true and endpoint timestamps from get (if-match).",
    input: UnlinkInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => unlinkGraphNodes(pool, input),
  });
}
