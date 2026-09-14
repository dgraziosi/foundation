import { advertisedMcpTool, WorkingSetInputSchema, WorkingSetSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { workingSetGraph } from "../working-set.js";
import { defineTool } from "./define-tool.js";

export function registerWorkingSetTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "working_set",
    description: advertisedMcpTool("working_set").description,
    input: WorkingSetInputSchema.shape,
    output: WorkingSetSuccessSchema,
    handler: async (input) => workingSetGraph(pool, input),
  });
}
