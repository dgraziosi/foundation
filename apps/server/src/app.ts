import { pingDb, type Pool } from "@foundation/db";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Express } from "express";
import { requireApiKey } from "./auth.js";
import type { AppConfig } from "./config.js";
import { handleMcpRequest } from "./mcp.js";

export function createApp(pool: Pool, config: AppConfig): Express {
  const app = createMcpExpressApp({
    host: config.HOST,
    allowedHosts: ["localhost", "127.0.0.1", "[::1]"],
  });

  app.get("/health", async (_req, res) => {
    const db = await pingDb(pool);
    res.status(db ? 200 : 503).json({
      ok: db,
      service: "foundation",
      db: db ? "up" : "down",
    });
  });

  app.use("/mcp", requireApiKey(config.FOUNDATION_API_KEY));

  app.post("/mcp", async (req, res) => {
    try {
      await handleMcpRequest(pool, req, res);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  return app;
}
