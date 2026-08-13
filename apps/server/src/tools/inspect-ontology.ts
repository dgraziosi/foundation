import {
  InspectOntologyInputSchema,
  InspectOntologySuccessSchema,
} from "@foundation/schema";
import type { Pool } from "@foundation/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inspectOntology } from "../graph.js";
import { defineTool } from "./define-tool.js";

export function registerInspectOntologyTool(server: McpServer, pool: Pool): void {
  defineTool(server, {
    name: "inspect_ontology",
    description: "List type and relation registry rows (system + authored).",
    input: InspectOntologyInputSchema.shape,
    output: InspectOntologySuccessSchema,
    handler: async (input) => inspectOntology(pool, input.kind ?? "all"),
  });
}
