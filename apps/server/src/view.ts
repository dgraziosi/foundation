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
  viewType,
} from "./view-data.js";
import { viewJournalToday, viewJournalTodayPeek, viewJournalWrite } from "./view-journal.js";

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
  <title>Unlock</title>
  <style>
    :root { --canvas: #0a0a0a; --ink: #ffffff; --elevated: #171717; --accent: #ffffff; --on-accent: #0a0a0a; --removed: #ff6467; --secondary: #a1a1a1; color-scheme: dark; }
    html, body { margin: 0; min-height: 100%; background: var(--canvas); color: var(--ink); font: 400 15px/1.6 Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100dvh; display: grid; place-items: center; padding: 21px; }
    form { display: flex; flex-direction: column; gap: 13px; width: min(20rem, 100%); background: var(--elevated); border-radius: 21px; padding: 34px; }
    h1 { font-size: 21px; font-weight: 500; line-height: 1.2; letter-spacing: -0.01em; margin: 0; }
    label { display: flex; flex-direction: column; gap: 8px; color: var(--secondary); font-size: 12px; }
    .notice { color: var(--removed); margin: 0; }
    input { padding: 8px 13px; border: 1px solid #262626; border-radius: 8px; background: var(--canvas); color: var(--ink); font: inherit; }
    button { padding: 8px 13px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 500; cursor: pointer; }
  </style>
</head>
<body>
<main>
  <form method="post" action="${VIEW_PATH}/unlock">
    <h1>Unlock.</h1>
    <label>Vault key
    ${notice}
    <input type="password" name="api_key" autocomplete="current-password" required>
    </label>
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

function sendJournalResult(res: Response, got: unknown): void {
  if (got && typeof got === "object" && "node" in got) {
    res.json(got);
    return;
  }
  const message =
    got && typeof got === "object" && "error" in got && typeof (got as { error: unknown }).error === "string"
      ? (got as { error: string }).error
      : "Could not write.";
  const status =
    message === "Not found"
      ? 404
      : message === "Journal writes only."
        ? 403
        : message === "Title is required."
          ? 400
          : /base_updated_at/.test(message)
            ? 409
            : 400;
  res.status(status).json({ error: message });
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
      res.status(401).type("html").send(unlockFallback("That key did not unlock."));
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

  app.get(`${VIEW_PATH}/api/types/:slug`, gate, async (req, res) => {
    try {
      const got = await viewType(pool, String(req.params.slug ?? ""));
      if ("error" in got) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(got);
    } catch (error) {
      console.error("View type failed", error);
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
      const depthRaw = queryString(req, "depth");
      const depth = depthRaw ? Number(depthRaw) : undefined;
      res.json(
        await viewGraph(pool, {
          focus: queryString(req, "focus") || undefined,
          type: queryString(req, "type") || undefined,
          depth: Number.isFinite(depth) ? depth : undefined,
        }),
      );
    } catch (error) {
      console.error("View graph failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/recents`, gate, async (req, res) => {
    try {
      const limitRaw = queryString(req, "limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      res.json(await viewRecents(pool, { limit: Number.isFinite(limit) ? limit : undefined }));
    } catch (error) {
      console.error("View recents failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.get(`${VIEW_PATH}/api/tasks`, gate, async (req, res) => {
    try {
      const limitRaw = queryString(req, "limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      res.json(await viewTasks(pool, { limit: Number.isFinite(limit) ? limit : undefined }));
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

  app.get(`${VIEW_PATH}/api/journals/today`, gate, async (_req, res) => {
    try {
      const got = await viewJournalTodayPeek(pool, config.FOUNDATION_DATA);
      if (got && "node" in got && got.node === null) {
        res.json({ node: null });
        return;
      }
      sendJournalResult(res, got);
    } catch (error) {
      console.error("View journal today peek failed", error);
      res.status(500).json({ error: "Could not load." });
    }
  });

  app.post(`${VIEW_PATH}/api/journals/today`, gate, async (_req, res) => {
    try {
      sendJournalResult(res, await viewJournalToday(pool, config.FOUNDATION_DATA));
    } catch (error) {
      console.error("View journal today failed", error);
      res.status(500).json({ error: "Could not write." });
    }
  });

  app.patch(`${VIEW_PATH}/api/nodes/:id`, gate, async (req, res) => {
    try {
      const title = typeof req.body?.title === "string" ? req.body.title : "";
      const body = typeof req.body?.body === "string" ? req.body.body : "";
      const base = typeof req.body?.base_updated_at === "string" ? req.body.base_updated_at : "";
      sendJournalResult(
        res,
        await viewJournalWrite(pool, config.FOUNDATION_DATA, {
          id: String(req.params.id ?? ""),
          title,
          body,
          base_updated_at: base,
        }),
      );
    } catch (error) {
      console.error("View journal write failed", error);
      res.status(500).json({ error: "Could not write." });
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
