import { DeleteInputSchema, MutationOkSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeContextOf } from "../auth.js";
import { deleteGraphNode } from "../graph.js";
import type { AgentPrincipal } from "../keyring.js";
import { defineTool } from "./define-tool.js";

export function registerDeleteTool(server: McpServer, pool: Pool, agent: AgentPrincipal): void {
  defineTool(server, {
    name: "delete",
    description: "Soft-delete a node. Needs a key with destructive scope.",
    input: DeleteInputSchema.shape,
    output: MutationOkSchema,
    handler: async (input) => deleteGraphNode(pool, input, writeContextOf(agent)),
  });
}
