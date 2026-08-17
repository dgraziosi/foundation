import type { Pool } from "@foundation/db";
import {
  isToolError,
  isUuid,
  type Blob,
  type IncidentEdge,
  type Node,
  type NodeType,
  type SearchHit,
  type SuggestedLink,
} from "@foundation/schema";
import type { Express, NextFunction, Request, Response } from "express";
import { apiKeyCookieHeader, providedApiKey } from "./auth.js";
import { sendBlob } from "./blobs-http.js";
import type { AppConfig } from "./config.js";
import { getGraphNode, inspectOntology, searchGraphNodes } from "./graph.js";

export const VIEW_PATH = "/view";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 1.5rem auto; padding: 0 1rem; line-height: 1.45; }
    form.row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin-bottom: 1.25rem; }
    label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
    input, select { min-width: 12rem; padding: 0.35rem 0.5rem; }
    button { padding: 0.4rem 0.75rem; }
    ul.results, ul.neighbors, ul.proposals { list-style: none; padding: 0; }
    ul.results li, ul.neighbors li, ul.proposals li { padding: 0.45rem 0; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
    .meta { opacity: 0.65; font-size: 0.9rem; }
    .notice { opacity: 0.8; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, currentColor 6%, transparent); padding: 0.75rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
    dt { font-weight: 600; }
    .proposals-box { border-left: 3px solid color-mix(in srgb, currentColor 30%, transparent); padding-left: 0.75rem; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function unlockPage(error?: string): string {
  const notice = error ? `<p class="notice">${escapeHtml(error)}</p>` : "";
  return page(
    "Unlock vault window",
    `<h1>Unlock the vault window</h1>
<p>Same API key that unlocks MCP. This window is read-only.</p>
${notice}
<form class="row" method="post" action="${VIEW_PATH}/unlock">
  <label>API key <input type="password" name="api_key" autocomplete="current-password" required></label>
  <button type="submit">Unlock</button>
</form>`,
  );
}

function requireViewAuth(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = providedApiKey(req);
    if (!provided || provided !== expected) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="foundation"');
      res.status(401).type("html").send(unlockPage("API key required"));
      return;
    }
    next();
  };
}

function queryString(req: Request, name: string): string {
  const value = req.query[name];
  return typeof value === "string" ? value : "";
}

function formatDataValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function typeOptions(types: NodeType[], selected: string): string {
  const options = [`<option value="">Any</option>`];
  for (const type of types) {
    const sel = type.slug === selected ? " selected" : "";
    options.push(
      `<option value="${escapeHtml(type.slug)}"${sel}>${escapeHtml(type.label)} (${escapeHtml(type.slug)})</option>`,
    );
  }
  return options.join("");
}

function searchPage(input: {
  q: string;
  type: string;
  types: NodeType[];
  hits: SearchHit[];
  searched: boolean;
  notice?: string;
}): string {
  const rows = input.hits.map((hit) => {
    const due = hit.due ? ` · due ${escapeHtml(hit.due)}` : "";
    return `<li><a href="${VIEW_PATH}/nodes/${encodeURIComponent(hit.id)}">${escapeHtml(hit.title)}</a> <span class="meta">${escapeHtml(hit.type)}${due}</span></li>`;
  });
  let results: string;
  if (!input.searched) {
    results = `<p class="notice">Search the graph, or filter by type.</p><ul class="results"></ul>`;
  } else if (input.hits.length === 0) {
    results = `<p class="notice">No matching nodes.</p><ul class="results"></ul>`;
  } else {
    results = `<ul class="results">${rows.join("")}</ul>`;
  }
  const notice = input.notice ? `<p class="notice">${escapeHtml(input.notice)}</p>` : "";
  return page(
    "Vault",
    `<h1>Vault</h1>
<p>Read-only window on this vault. Same graph as MCP.</p>
<form class="row" method="get" action="${VIEW_PATH}">
  <label>Search <input type="search" name="q" value="${escapeHtml(input.q)}"></label>
  <label>Type <select name="type">${typeOptions(input.types, input.type)}</select></label>
  <button type="submit">Search</button>
</form>
${notice}
${results}`,
  );
}

function nodePage(got: {
  node: Node;
  edges: IncidentEdge[];
  blob?: Blob;
  suggested_links: SuggestedLink[];
}): string {
  const { node, edges, blob, suggested_links } = got;
  const dataEntries = Object.entries(node.data);
  const dataBlock =
    dataEntries.length === 0
      ? `<p class="notice">No data fields.</p>`
      : `<dl>${dataEntries
          .map(
            ([key, value]) =>
              `<dt>${escapeHtml(key)}</dt><dd><pre>${escapeHtml(formatDataValue(value))}</pre></dd>`,
          )
          .join("")}</dl>`;

  let payloadBlock: string;
  if (node.payload.storage === "blob") {
    const blobId = blob?.id ?? node.payload.blob_id ?? "";
    const meta = blob
      ? `<dl>
  <dt>blob_id</dt><dd>${escapeHtml(blob.id)}</dd>
  <dt>media_type</dt><dd>${escapeHtml(blob.media_type)}</dd>
  <dt>byte_size</dt><dd>${escapeHtml(String(blob.byte_size))}</dd>
  <dt>sha256</dt><dd>${escapeHtml(blob.sha256)}</dd>
</dl>`
      : `<p class="notice">Blob metadata unavailable.</p>`;
    const fetch =
      blobId !== ""
        ? `<p><a href="${VIEW_PATH}/blobs/${encodeURIComponent(blobId)}" download>Fetch bytes</a></p>`
        : "";
    payloadBlock = `${meta}${fetch}`;
  } else {
    payloadBlock = `<pre>${escapeHtml(node.payload.body ?? "")}</pre>`;
  }

  const neighborItems = edges.map((edge) => {
    const href = `${VIEW_PATH}/nodes/${encodeURIComponent(edge.neighbor.id)}`;
    return `<li><a href="${href}">${escapeHtml(edge.neighbor.title)}</a> <span class="meta">${escapeHtml(edge.relation_type)} · ${escapeHtml(edge.direction)}</span></li>`;
  });
  const neighbors =
    neighborItems.length === 0
      ? `<p class="notice">No neighbors.</p>`
      : `<ul class="neighbors">${neighborItems.join("")}</ul>`;

  const suggestions =
    suggested_links.length === 0
      ? ""
      : `<section class="proposals-box">
  <h2>Suggested links</h2>
  <p class="notice">Proposals only. This window cannot create an edge.</p>
  <ul class="proposals">${suggested_links
    .map((item) => {
      const href = `${VIEW_PATH}/nodes/${encodeURIComponent(item.target.id)}`;
      return `<li>${escapeHtml(item.kind)} → <a href="${href}">${escapeHtml(item.target.title)}</a> <span class="meta">${escapeHtml(item.target.type)}</span> — ${escapeHtml(item.reason)}</li>`;
    })
    .join("")}</ul>
</section>`;

  return page(
    node.title,
    `<p><a href="${VIEW_PATH}">Back to search</a></p>
<article>
  <h1>${escapeHtml(node.title)}</h1>
  <dl>
    <dt>Type</dt><dd>${escapeHtml(node.type)}</dd>
    <dt>Status</dt><dd>${escapeHtml(node.status)}</dd>
  </dl>
  <h2>Data</h2>
  ${dataBlock}
  <h2>Payload</h2>
  ${payloadBlock}
  <h2>Neighbors</h2>
  ${neighbors}
  ${suggestions}
</article>`,
  );
}

export function registerViewRoutes(app: Express, pool: Pool, config: AppConfig): void {
  const gate = requireViewAuth(config.FOUNDATION_API_KEY);

  app.get(`${VIEW_PATH}/unlock`, (_req, res) => {
    res.type("html").send(unlockPage());
  });

  app.post(`${VIEW_PATH}/unlock`, (req, res) => {
    const key = typeof req.body?.api_key === "string" ? req.body.api_key : "";
    if (key !== config.FOUNDATION_API_KEY) {
      res.setHeader("WWW-Authenticate", 'ApiKey realm="foundation"');
      res.status(401).type("html").send(unlockPage("API key required"));
      return;
    }
    res.setHeader("Set-Cookie", apiKeyCookieHeader(key));
    res.redirect(303, VIEW_PATH);
  });

  app.get(VIEW_PATH, gate, async (req, res) => {
    try {
      const q = queryString(req, "q");
      const type = queryString(req, "type");
      const ontology = await inspectOntology(pool, "types");
      const searched = Boolean(q.trim() || type.trim());
      let hits: SearchHit[] = [];
      let notice: string | undefined;
      if (searched) {
        const result = await searchGraphNodes(pool, {
          query: q.trim() || undefined,
          type: type.trim() || undefined,
        });
        if (isToolError(result)) {
          notice = result.error;
        } else {
          hits = result.nodes;
        }
      }
      res.type("html").send(
        searchPage({
          q,
          type,
          types: ontology.types,
          hits,
          searched,
          notice,
        }),
      );
    } catch (error) {
      console.error("View search failed", error);
      res.status(500).type("html").send(page("Vault", "<p>Internal server error</p>"));
    }
  });

  app.get(`${VIEW_PATH}/blobs/:id`, gate, async (req, res) => {
    try {
      await sendBlob(pool, config, req, res);
    } catch (error) {
      console.error("View blob fetch failed", error);
      if (!res.headersSent) {
        res.status(500).type("html").send(page("Vault", "<p>Internal server error</p>"));
      }
    }
  });

  app.get(`${VIEW_PATH}/nodes/:id`, gate, async (req, res) => {
    try {
      const id = String(req.params.id ?? "");
      if (!isUuid(id)) {
        res.status(404).type("html").send(page("Not found", "<p>Node not found.</p>"));
        return;
      }
      const got = await getGraphNode(pool, id, { blobs: { dataDir: config.FOUNDATION_DATA } });
      if (isToolError(got)) {
        res.status(404).type("html").send(page("Not found", `<p>${escapeHtml(got.error)}</p>`));
        return;
      }
      res.type("html").send(nodePage(got));
    } catch (error) {
      console.error("View node failed", error);
      res.status(500).type("html").send(page("Vault", "<p>Internal server error</p>"));
    }
  });
}
