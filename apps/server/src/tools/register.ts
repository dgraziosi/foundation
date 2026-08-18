import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function registerTools(server: McpServer, pool: Pool, dataDir: string): void {
  registerBootstrapTool(server, pool);
  registerSearchTool(server, pool);
  registerLookupTool(server, pool);
  registerGetTool(server, pool, dataDir);
  registerUpsertTool(server, pool, dataDir);
  registerDeleteTool(server, pool);
  registerLinkTool(server, pool);
  registerUnlinkTool(server, pool);
  registerInspectOntologyTool(server, pool);
  registerManageTypeTool(server, pool);
  registerManageRelationTool(server, pool);
  registerListActivityTool(server, pool);
  registerUndoTool(server, pool);
}
