import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Pool } from "@foundation/db";
import type { Request, Response } from "express";
import { registerTools } from "./tools/register.js";

export function createMcpServer(pool: Pool, dataDir: string): McpServer {
  const server = new McpServer(
    { name: "foundation", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerTools(server, pool, dataDir);
  return server;
}

export async function handleMcpRequest(
  pool: Pool,
  req: Request,
  res: Response,
  dataDir: string,
): Promise<void> {
  const server = createMcpServer(pool, dataDir);
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
