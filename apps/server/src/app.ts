import { pingDb, type Pool } from "@foundation/db";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import express, { type Express } from "express";
import { requireApiKey } from "./auth.js";
import { sendBlob } from "./blobs-http.js";
import type { AppConfig } from "./config.js";
import { handleMcpRequest } from "./mcp.js";
import { isViewPath } from "./security.js";
import { registerViewRoutes } from "./view.js";

/** 20MB blob cap as base64 plus JSON-RPC envelope. */
const JSON_BODY_LIMIT = "32mb";

const localhostHosts = hostHeaderValidation(["localhost", "127.0.0.1", "[::1]"]);

function requestPath(req: express.Request): string {
  return (req.originalUrl.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}

/**
 * `/view` works off-box (published 8787). Other paths need a localhost Host.
 * Socket loopback is not the gate: Compose's published port presents the
 * bridge gateway as the peer, which would 403 the documented host harness.
 */
function hostGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const path = requestPath(req);
  if (isViewPath(path)) {
    next();
    return;
  }
  localhostHosts(req, res, next);
}

export function createApp(pool: Pool, config: AppConfig): Express {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false }));
  app.use(hostGuard);

  app.get("/health", async (_req, res) => {
    const db = await pingDb(pool);
    res.status(db ? 200 : 503).json({
      ok: db,
      service: "foundation",
      db: db ? "up" : "down",
    });
  });

  registerViewRoutes(app, pool, config);

  app.get("/blobs/:id", requireApiKey(config.FOUNDATION_API_KEY), async (req, res) => {
    try {
      await sendBlob(pool, config, req, res);
    } catch (error) {
      console.error("Blob fetch failed", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.use("/mcp", requireApiKey(config.FOUNDATION_API_KEY));

  app.post("/mcp", async (req, res) => {
    try {
      await handleMcpRequest(pool, req, res, config.FOUNDATION_DATA);
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
