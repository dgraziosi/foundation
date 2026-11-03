import { pingDb, type Pool } from "@foundation/db";
import express, { type Express } from "express";
import { healthKeyMatches, requireApiKey } from "./auth.js";
import { sendBlob } from "./blobs-http.js";
import type { AppBindings } from "./config.js";
import { Keyring } from "./keyring.js";
import { handleMcpRequest } from "./mcp.js";
import { isAgentPath } from "./security.js";
import { FailureLedger, ViewDoor } from "./view-door.js";
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

/** State both doors share in one process, so a ledger or session seen on one door holds on the other. */
export type DoorShared = {
  readonly viewDoor: ViewDoor;
  readonly headerLedger: FailureLedger;
};

export function doorSharedOf(config: AppBindings): DoorShared {
  return {
    viewDoor: ViewDoor.fromBindings(config),
    headerLedger: new FailureLedger(),
  };
}

function registerHealth(app: Express, pool: Pool, config: AppBindings, keyring: Keyring, shared: DoorShared): void {
  app.get("/health", async (req, res) => {
    const db = await pingDb(pool);
    const body: Record<string, unknown> = {
      ok: db,
      service: "foundation",
      db: db ? "up" : "down",
    };
    if (healthKeyMatches(req, keyring, shared.headerLedger)) {
      if (config.HOST !== undefined) {
        body.host = config.HOST;
      }
      if (config.PORT !== undefined) {
        body.port = config.PORT;
      }
      if (config.VIEW_HOST !== undefined) {
        body.view_host = config.VIEW_HOST;
      }
      if (config.VIEW_PORT !== undefined) {
        body.view_port = config.VIEW_PORT;
      }
      body.data = config.FOUNDATION_DATA;
    }
    res.status(db ? 200 : 503).json(body);
  });
}

function registerMcpAndBlobs(
  app: Express,
  pool: Pool,
  config: AppBindings,
  keyring: Keyring,
  shared: DoorShared,
): void {
  const gate = requireApiKey(keyring, shared.headerLedger);
  app.get("/blobs/:id", gate, async (req, res) => {
    try {
      await sendBlob(pool, config, req, res);
    } catch (error) {
      console.error("Blob fetch failed", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.use("/mcp", gate);

  app.post("/mcp", async (req, res) => {
    try {
      const agent = req.agent;
      if (!agent) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized" },
          id: null,
        });
        return;
      }
      await handleMcpRequest(
        pool,
        req,
        res,
        config.FOUNDATION_DATA,
        agent,
        config.FOUNDATION_LEASE_TTL_SECONDS === undefined
          ? undefined
          : { ttlSeconds: config.FOUNDATION_LEASE_TTL_SECONDS },
      );
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

export function createApp(
  pool: Pool,
  config: AppBindings,
  door: AppDoor = "mcp",
  keyring?: Keyring,
  shared?: DoorShared,
): Express {
  const ring = keyring ?? Keyring.fromBindings(config);
  const state = shared ?? doorSharedOf(config);
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false }));

  if (door === "view") {
    app.use(refuseAgentPaths);
    registerHealth(app, pool, config, ring, state);
    registerViewRoutes(app, pool, config, state.viewDoor, state.headerLedger);
    return app;
  }

  registerHealth(app, pool, config, ring, state);
  registerViewRoutes(app, pool, config, state.viewDoor, state.headerLedger);
  registerMcpAndBlobs(app, pool, config, ring, state);
  return app;
}
