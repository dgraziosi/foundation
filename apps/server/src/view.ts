import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "@foundation/db";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import { apiKeyCookieHeader, providedApiKey } from "./auth.js";
import { sendBlob } from "./blobs-http.js";
import type { AppBindings } from "./config.js";
import {
  viewGraph,
  viewNode,
  viewOntology,
  viewRecents,
  viewSearch,
  viewTasks,
} from "./view-data.js";

export const VIEW_PATH = "/view";

const here = dirname(fileURLToPath(import.meta.url));

export function viewerDistDir(): string {
  return join(here, "../../viewer/dist");
}

function wantsJson(req: Request): boolean {
  const accept = req.header("accept") ?? "";
  const type = req.header("content-type") ?? "";
  return accept.includes("application/json") || type.includes("application/json");
}

function queryString(req: Request, name: string): string {
  const value = req.query[name];
  return typeof value === "string" ? value : "";
}

function unlockFallback(error?: string): string {
  const notice = error ? `<p class="notice">${escapeHtml(error)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unlock the vault window</title>
  <style>
    :root { --bg: #f7f7f4; --ink: #26251e; --accent: #f54e00; color-scheme: light; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font: 13px/1.45 Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100dvh; display: grid; place-items: center; padding: 16px; }
    form { display: flex; flex-direction: column; gap: 12px; width: min(22rem, 100%); }
    h1 { font-size: 20px; font-weight: 600; margin: 0; }
    .quiet { color: color-mix(in srgb, var(--ink) 62%, var(--bg)); margin: 0; }
    .notice { color: var(--accent); margin: 0; }
    input { padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent); background: var(--bg); color: var(--ink); font: inherit; }
    button { padding: 8px 12px; border: 0; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
<main>
  <form method="post" action="${VIEW_PATH}/unlock">
    <h1>Unlock the vault window</h1>
    <p class="quiet">Same key as MCP. This window is read-only.</p>
    ${notice}
    <input type="password" name="api_key" autocomplete="current-password" required>
    <button type="submit">Unlock</button>
  </form>
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requireViewAuth(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = providedApiKey(req);
    if (!provided || provided !== expected) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="foundation"');
      res.status(401).json({ error: "API key required" });
      return;
    }
    next();
  };
}

function sendViewerApp(res: Response): void {
  const index = join(viewerDistDir(), "index.html");
  if (existsSync(index)) {
    res.sendFile(index);
    return;
  }
  res.type("html").send(unlockFallback());
}

function isApiPath(path: string): boolean {
  return path.startsWith(`${VIEW_PATH}/api`);
}

function isBlobPath(path: string): boolean {
  return path.startsWith(`${VIEW_PATH}/blobs/`);
}

export function registerViewRoutes(app: Express, pool: Pool, config: AppBindings): void {
  const gate = requireViewAuth(config.FOUNDATION_API_KEY);
  const dist = viewerDistDir();

  app.get(`${VIEW_PATH}/unlock`, (_req, res) => {
    sendViewerApp(res);
  });

  app.post(`${VIEW_PATH}/unlock`, (req, res) => {
    const key = typeof req.body?.api_key === "string" ? req.body.api_key : "";
    if (key !== config.FOUNDATION_API_KEY) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="foundation"');
      if (wantsJson(req)) {
        res.status(401).json({ error: "API key required" });
        return;
      }
      res.status(401).type("html").send(unlockFallback("API key required"));
      return;
    }
    res.setHeader("Set-Cookie", apiKeyCookieHeader(key));
    if (wantsJson(req)) {
      res.json({ ok: true });
      return;
    }
    res.redirect(303, VIEW_PATH);
  });

  app.get(`${VIEW_PATH}/api/session`, gate, (_req, res) => {
    res.json({ ok: true });
  });

  app.get(`${VIEW_PATH}/api/ontology`, gate, async (_req, res) => {
    try {
      res.json(await viewOntology(pool));
    } catch (error) {
      console.error("View ontology failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/search`, gate, async (req, res) => {
    try {
      res.json(
        await viewSearch(pool, {
          q: queryString(req, "q"),
          type: queryString(req, "type"),
          status: queryString(req, "status"),
        }),
      );
    } catch (error) {
      console.error("View search failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/graph`, gate, async (req, res) => {
    try {
      res.json(
        await viewGraph(pool, {
          focus: queryString(req, "focus") || undefined,
          type: queryString(req, "type") || undefined,
        }),
      );
    } catch (error) {
      console.error("View graph failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/recents`, gate, async (_req, res) => {
    try {
      res.json(await viewRecents(pool));
    } catch (error) {
      console.error("View recents failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/tasks`, gate, async (_req, res) => {
    try {
      res.json(await viewTasks(pool));
    } catch (error) {
      console.error("View tasks failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/nodes/:id`, gate, async (req, res) => {
    try {
      const got = await viewNode(pool, String(req.params.id ?? ""), config.FOUNDATION_DATA);
      if ("error" in got) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(got);
    } catch (error) {
      console.error("View node failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/blobs/:id`, gate, async (req, res) => {
    try {
      await sendBlob(pool, config, req, res);
    } catch (error) {
      console.error("View blob fetch failed", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Could not load." });
      }
    }
  });

  if (existsSync(dist)) {
    app.use(VIEW_PATH, express.static(dist, { index: false, fallthrough: true }));
  }

  app.get([VIEW_PATH, `${VIEW_PATH}/{*path}`], (req, res, next) => {
    const path = req.path;
    if (isApiPath(path) || isBlobPath(path)) {
      next();
      return;
    }
    sendViewerApp(res);
  });
}
