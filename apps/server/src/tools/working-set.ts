import { WorkingSetInputSchema, WorkingSetSuccessSchema } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { workingSetGraph } from "../working-set.js";
import { defineTool } from "./define-tool.js";

export function registerWorkingSetTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "working_set",
    description:
      "Return the actionable working set around one live node: open work, dues, and the parent chain when the root hangs under something. Read-only. If you already have a UUID, call this for the agenda; call get for the node. After lookup binds a name, this is the one agenda call.",
    input: WorkingSetInputSchema.shape,
    output: WorkingSetSuccessSchema,
    handler: async (input) => workingSetGraph(pool, input),
  });
}
