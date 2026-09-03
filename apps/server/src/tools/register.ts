import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentPrincipal } from "../keyring.js";
import { registerBootstrapTool } from "./bootstrap.js";
import { registerDeleteTool } from "./delete.js";
import { registerGetTool } from "./get.js";
import { registerInspectOntologyTool } from "./inspect-ontology.js";
import { registerLinkTool } from "./link.js";
import { registerListActivityTool } from "./list-activity.js";
import { registerManageRelationTool } from "./manage-relation.js";
import { registerManageTypeTool } from "./manage-type.js";
import { registerLookupTool } from "./lookup.js";
import { registerSearchTool } from "./search.js";
import { registerUndoTool } from "./undo.js";
import { registerUnlinkTool } from "./unlink.js";
import { registerUpsertTool } from "./upsert.js";
import { registerWorkingSetTool } from "./working-set.js";
import { registerJobTool } from "./job.js";
import { DEFAULT_LEASE_TTL_SECONDS, type JobLeasePolicy } from "@foundation/schema";
import { leasePolicyFromSeconds } from "../leases.js";

export function registerTools(
  server: McpServer,
  pool: Pool,
  dataDir: string,
  agent: AgentPrincipal,
  policy: JobLeasePolicy = leasePolicyFromSeconds(DEFAULT_LEASE_TTL_SECONDS),
): void {
  registerBootstrapTool(server, pool, agent);
  registerSearchTool(server, pool);
  registerLookupTool(server, pool);
  registerGetTool(server, pool, dataDir);
  registerWorkingSetTool(server, pool);
  registerUpsertTool(server, pool, dataDir, agent);
  registerDeleteTool(server, pool, agent);
  registerLinkTool(server, pool, agent);
  registerUnlinkTool(server, pool, agent);
  registerInspectOntologyTool(server, pool);
  registerManageTypeTool(server, pool, agent);
  registerManageRelationTool(server, pool, agent);
  registerListActivityTool(server, pool);
  registerUndoTool(server, pool, agent);
  registerJobTool(server, pool, agent, policy);
}
