import { advertisedMcpTool, UpsertInputSchema, UpsertSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { upsertGraphNode } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerUpsertTool(
  server: McpServer,
  pool: Pool,
  dataDir: string,
  agent: AgentPrincipal,
): void {
  defineTool(server, {
    name: "upsert",
    description: advertisedMcpTool("upsert").description,
    input: UpsertInputSchema.shape,
    output: UpsertSuccessSchema,
    handler: async (input) => upsertGraphNode(pool, input, { dataDir }, writeContextOf(agent)),
  });
}
