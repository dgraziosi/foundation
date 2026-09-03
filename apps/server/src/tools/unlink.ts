import { MutationOkSchema, UnlinkInputSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { unlinkGraphNodes } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerUnlinkTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "unlink",
    description:
      "Remove a typed edge. Needs a key with destructive scope and endpoint timestamps from get (if-match).",
    input: UnlinkInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => unlinkGraphNodes(pool, input, writeContextOf(agent)),
  });
}
