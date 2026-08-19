import { pingDb, type Pool } from "@foundation/db";
import express, { type Express } from "express";
import { requireApiKey } from "./auth.js";
import { sendBlob } from "./blobs-http.js";
import type { AppBindings } from "./config.js";
import { handleMcpRequest } from "./mcp.js";
import { isAgentPath } from "./security.js";
import { registerViewRoutes } from "./view.js";

/** 20MB blob cap as base64 plus JSON-RPC envelope. */
const JSON_BODY_LIMIT = "32mb";

export type AppDoor = "mcp" | "view";

function requestPath(req: express.Request): string {
  return (req.originalUrl.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
}

/** View publish must not serve write-capable agent routes, Host header or not. */
function refuseAgentPaths(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (isAgentPath(requestPath(req))) {
    res.status(403).json({ error: "Not available on the view door" });
    return;
  }
  next();
}

function registerHealth(app: Express, pool: Pool): void {
  app.get("/health", async (_req, res) => {
    const db = await pingDb(pool);
    res.status(db ? 200 : 503).json({
      ok: db,
      service: "foundation",
      db: db ? "up" : "down",
    });
  });
}

function registerMcpAndBlobs(app: Express, pool: Pool, config: AppBindings): void {
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
}

export function createApp(pool: Pool, config: AppBindings, door: AppDoor = "mcp"): Express {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false }));

  if (door === "view") {
    app.use(refuseAgentPaths);
    registerHealth(app, pool);
    registerViewRoutes(app, pool, config);
    return app;
  }

  registerHealth(app, pool);
  registerViewRoutes(app, pool, config);
  registerMcpAndBlobs(app, pool, config);
  return app;
}
