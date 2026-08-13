import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Pool } from "@foundation/db";
import type { Request, Response } from "express";
import { registerBootstrapTool } from "./tools/bootstrap.js";

export function createMcpServer(pool: Pool): McpServer {
  const server = new McpServer(
    { name: "foundation", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerBootstrapTool(server, pool);
  return server;
}

export async function handleMcpRequest(pool: Pool, req: Request, res: Response): Promise<void> {
  const server = createMcpServer(pool);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
