import { advertisedMcpTool, JobInputSchema, JobSuccessSchema, type JobLeasePolicy } from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentPrincipal } from "../keyring.js";
import { applyJob, leasePolicyFromSeconds } from "../leases.js";
import { defineTool } from "./define-tool.js";

export function registerJobTool(
  server: McpServer,
  pool: Pool,
  agent: AgentPrincipal,
  policy: JobLeasePolicy = leasePolicyFromSeconds(),
): void {
  defineTool(server, {
    name: "job",
    description: advertisedMcpTool("job").description,
    input: JobInputSchema.shape,
    output: JobSuccessSchema,
    handler: async (input) => applyJob(pool, input, agent, policy),
  });
}
