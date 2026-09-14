import { advertisedMcpTool, LinkInputSchema, LinkSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { linkGraphNodes } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerLinkTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "link",
    description: advertisedMcpTool("link").description,
    input: LinkInputSchema.shape,
    output: LinkSuccessSchema,
    handler: async (input) => linkGraphNodes(pool, input, writeContextOf(agent)),
  });
}
