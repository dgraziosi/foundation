import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { createApp } from "./app.js";
import { getGraphNode, linkGraphNodes, listGraphActivity, upsertGraphNode } from "./graph.js";
import { viewerDistDir } from "./view.js";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = "test-foundation-key";

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  await seedSystemOntology(pool);
  return pool;
}

function authHeader(): { authorization: string } {
  return { authorization: `ApiKey ${apiKey}` };
}

function mcpUpsertBody(title: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "upsert",
      arguments: { type: "note", title },
    },
  });
}

async function unlockCookie(origin: string): Promise<string> {
  const unlock = await fetch(`${origin}/view/unlock`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `api_key=${encodeURIComponent(apiKey)}`,
    redirect: "manual",
  });
  assert.equal(unlock.status, 303);
  const setCookie = unlock.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

test("read-only window: auth, search, node page, no writes", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("readonly_view");
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-view-"));
  const app = createApp(pool, {
    FOUNDATION_API_KEY: apiKey,
    DATABASE_URL: databaseUrl,
    FOUNDATION_DATA: dataDir,
    PORT: 0,
    HOST: "127.0.0.1",
  });
  const httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer.on("listening", () => resolve()));
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    await t.test("refuses the window APIs without the API key", async () => {
      const home = await fetch(`${origin}/view`);
      assert.equal(home.status, 200);
      const html = await home.text();
      assert.match(html, /Foundation/);
      assert.match(html, /\/view\/assets\//);
      assert.doesNotMatch(html, /localhost-only|127\.0\.0\.1 only/i);
      const script = html.match(/src="(\/view\/assets\/[^"]+\.js)"/);
      assert.ok(script);
      const bundle = await fetch(`${origin}${script[1]}`);
      assert.equal(bundle.status, 200);
      const js = await bundle.text();
      assert.match(js, /Unlock the vault window/);
      assert.match(js, /Same key as MCP/);
      assert.match(js, /Select a node/);
      assert.match(js, /No tasks yet/);
      assert.doesNotMatch(js, /manage_type|confirm: true|localhost-only/);

      const session = await fetch(`${origin}/view/api/session`);
      assert.equal(session.status, 401);
      assert.match(await session.text(), /API key required/i);

      const node = await fetch(`${origin}/view/api/nodes/11111111-1111-4111-8111-111111111111`);
      assert.equal(node.status, 401);

      const blob = await fetch(`${origin}/view/blobs/11111111-1111-4111-8111-111111111111`);
      assert.equal(blob.status, 401);
    });

    await t.test("succeeds with the API key; empty graph is empty, not an error", async () => {
      const session = await fetch(`${origin}/view/api/session`, { headers: authHeader() });
      assert.equal(session.status, 200);

      const graph = await fetch(`${origin}/view/api/graph`, { headers: authHeader() });
      assert.equal(graph.status, 200);
      const graphBody = (await graph.json()) as { nodes: unknown[]; edges: unknown[] };
      assert.deepEqual(graphBody.nodes, []);
      assert.deepEqual(graphBody.edges, []);

      const search = await fetch(`${origin}/view/api/search`, { headers: authHeader() });
      assert.equal(search.status, 200);
      const searchBody = (await search.json()) as { searched: boolean; hits: unknown[] };
      assert.equal(searchBody.searched, false);
      assert.deepEqual(searchBody.hits, []);

      const listed = await fetch(`${origin}/view/api/search?type=note`, { headers: authHeader() });
      assert.equal(listed.status, 200);
      const listedBody = (await listed.json()) as { searched: boolean; hits: unknown[] };
      assert.equal(listedBody.searched, true);
      assert.deepEqual(listedBody.hits, []);

      const recents = await fetch(`${origin}/view/api/recents`, { headers: authHeader() });
      assert.equal(recents.status, 200);
      const recentsBody = (await recents.json()) as { rows: unknown[] };
      assert.deepEqual(recentsBody.rows, []);

      const tasks = await fetch(`${origin}/view/api/tasks`, { headers: authHeader() });
      assert.equal(tasks.status, 200);
      const tasksBody = (await tasks.json()) as { tasks: unknown[] };
      assert.deepEqual(tasksBody.tasks, []);
    });

    await t.test("unlock cookie opens the window", async () => {
      const denied = await fetch(`${origin}/view/unlock`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "api_key=nope",
        redirect: "manual",
      });
      assert.equal(denied.status, 401);
      assert.match(await denied.text(), /API key required/i);

      const unlock = await fetch(`${origin}/view/unlock`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `api_key=${encodeURIComponent(apiKey)}`,
        redirect: "manual",
      });
      assert.equal(unlock.status, 303);
      const setCookie = unlock.headers.get("set-cookie") ?? "";
      assert.match(setCookie, /foundation_key=/);
      assert.match(setCookie, /Path=\/view/i);
      const cookie = setCookie.split(";")[0];
      assert.ok(cookie);

      const session = await fetch(`${origin}/view/api/session`, { headers: { cookie } });
      assert.equal(session.status, 200);

      const { rows: countBefore } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      const mcp = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: mcpUpsertBody("Cookie must not write"),
      });
      assert.equal(mcp.status, 401);
      const { rows: countAfter } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      assert.equal(countAfter[0]?.n, countBefore[0]?.n);
    });

    await t.test("off-box Host can unlock /view and cannot use the cookie on /mcp", async () => {
      const offbox = `192.168.10.20:${address.port}`;
      const denied = await fetch(`${origin}/view/api/session`, { headers: { host: offbox } });
      assert.equal(denied.status, 401);

      const unlock = await fetch(`${origin}/view/unlock`, {
        method: "POST",
        headers: {
          host: offbox,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ api_key: apiKey }),
      });
      assert.equal(unlock.status, 200);
      const setCookie = unlock.headers.get("set-cookie") ?? "";
      assert.match(setCookie, /Path=\/view/i);
      const cookie = setCookie.split(";")[0];
      assert.ok(cookie);

      const session = await fetch(`${origin}/view/api/session`, { headers: { host: offbox, cookie } });
      assert.equal(session.status, 200);

      const mcp = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          host: offbox,
          cookie,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: mcpUpsertBody("Off-box cookie must not write"),
      });
      assert.ok(mcp.status === 401 || mcp.status === 403);
    });

    await t.test("Authorization header still succeeds on MCP", async () => {
      const res = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          ...authHeader(),
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "bootstrap", arguments: {} },
        }),
      });
      assert.equal(res.status, 200);
    });

    const project = await upsertGraphNode(pool, {
      type: "project",
      title: "Fixture project",
    });
    assert.equal(isToolError(project), false);
    if (isToolError(project)) {
      return;
    }

    const note = await upsertGraphNode(pool, {
      type: "note",
      title: "Fixture note",
      payload: {
        media_type: "text/plain",
        storage: "inline",
        body: "fixture payload text",
      },
    });
    assert.equal(isToolError(note), false);
    if (isToolError(note)) {
      return;
    }

    const linked = await linkGraphNodes(pool, {
      from_id: note.node.id,
      to_id: project.node.id,
      relation_type: "relates_to",
      from_base_updated_at: note.node.updated_at,
      to_base_updated_at: project.node.updated_at,
    });
    assert.equal(isToolError(linked), false);

    const dueTask = await upsertGraphNode(pool, {
      type: "task",
      title: "Fixture due task",
      data: { due: "2026-08-20" },
    });
    assert.equal(isToolError(dueTask), false);
    if (isToolError(dueTask)) {
      return;
    }

    const pdf = Buffer.from("%PDF-1.1\ntrailer<</Root 1 0 R>>\n%%EOF\n", "utf8");
    const blobNote = await upsertGraphNode(
      pool,
      {
        type: "note",
        title: "Fixture blob note",
        payload: {
          media_type: "application/pdf",
          storage: "blob",
          bytes_base64: pdf.toString("base64"),
        },
      },
      { dataDir },
    );
    assert.equal(isToolError(blobNote), false);
    if (isToolError(blobNote)) {
      return;
    }

    await t.test("search results show title, type, and due", async () => {
      const res = await fetch(
        `${origin}/view/api/search?q=${encodeURIComponent("Fixture due")}&type=task`,
        { headers: authHeader() },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        hits: Array<{ title: string; type: string; due?: string }>;
      };
      assert.equal(body.hits[0]?.title, "Fixture due task");
      assert.equal(body.hits[0]?.type, "task");
      assert.equal(body.hits[0]?.due, "2026-08-20");
    });

    await t.test("graph working set includes nodes and edges", async () => {
      const res = await fetch(`${origin}/view/api/graph`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        nodes: Array<{ title: string }>;
        edges: Array<{ from: string; to: string; relation_type: string }>;
      };
      const titles = body.nodes.map((node) => node.title);
      assert.ok(titles.includes("Fixture note"));
      assert.ok(titles.includes("Fixture project"));
      assert.ok(
        body.edges.some(
          (edge) =>
            edge.relation_type === "relates_to" &&
            (edge.from === note.node.id || edge.to === note.node.id),
        ),
      );
    });

    await t.test("node API shows title, payload, neighbors, and no write controls", async () => {
      const res = await fetch(`${origin}/view/api/nodes/${note.node.id}`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        node: { title: string; type: string; status: string; payload: { body?: string } };
        edges: Array<{ neighbor: { id: string; title: string } }>;
      };
      assert.equal(body.node.title, "Fixture note");
      assert.equal(body.node.type, "note");
      assert.equal(body.node.status, "active");
      assert.equal(body.node.payload.body, "fixture payload text");
      assert.equal(body.edges[0]?.neighbor.title, "Fixture project");
      assert.equal(body.edges[0]?.neighbor.id, project.node.id);

      const page = await fetch(`${origin}/view/nodes/${note.node.id}`, { headers: authHeader() });
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.doesNotMatch(html, />\s*(Upsert|Delete|Link|Unlink|Undo|Confirm)\s*</i);
    });

    await t.test("tasks board lists the fixture task", async () => {
      const res = await fetch(`${origin}/view/api/tasks`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        tasks: Array<{ title: string; status: string; due?: string }>;
      };
      const task = body.tasks.find((item) => item.title === "Fixture due task");
      assert.ok(task);
      assert.equal(task.status, "active");
      assert.equal(task.due, "2026-08-20");
    });

    await t.test("recents include create rows", async () => {
      const res = await fetch(`${origin}/view/api/recents`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { rows: Array<{ summary: string; action: string }> };
      assert.ok(body.rows.some((row) => row.summary === "Fixture note" && row.action === "create"));
    });

    const htmlBytes = Buffer.from(
      "<html><body><script>document.cookie</script><p>fixture html blob</p></body></html>",
      "utf8",
    );
    const htmlBlobNote = await upsertGraphNode(
      pool,
      {
        type: "note",
        title: "Fixture html blob",
        payload: {
          media_type: "text/html",
          storage: "blob",
          bytes_base64: htmlBytes.toString("base64"),
        },
      },
      { dataDir },
    );
    assert.equal(isToolError(htmlBlobNote), false);
    if (isToolError(htmlBlobNote)) {
      return;
    }

    await t.test("blob node shows metadata and a window download link", async () => {
      const got = await getGraphNode(pool, blobNote.node.id, { blobs: { dataDir } });
      assert.equal(isToolError(got), false);
      if (isToolError(got)) {
        return;
      }
      const res = await fetch(`${origin}/view/api/nodes/${blobNote.node.id}`, {
        headers: authHeader(),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        node: { title: string };
        blob?: { id: string; sha256: string; media_type: string };
      };
      assert.equal(body.node.title, "Fixture blob note");
      assert.ok(got.blob);
      assert.equal(body.blob?.id, got.blob.id);
      assert.equal(body.blob?.sha256, got.blob.sha256);
      assert.equal(body.blob?.media_type, "application/pdf");
    });

    await t.test("form unlock can download blob bytes without an Authorization header", async () => {
      const got = await getGraphNode(pool, blobNote.node.id, { blobs: { dataDir } });
      assert.equal(isToolError(got), false);
      if (isToolError(got) || !got.blob) {
        return;
      }
      const cookie = await unlockCookie(origin);
      const deniedAgentPath = await fetch(`${origin}/blobs/${got.blob.id}`, { headers: { cookie } });
      assert.equal(deniedAgentPath.status, 401);

      const download = await fetch(`${origin}/view/blobs/${got.blob.id}`, { headers: { cookie } });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get("content-type"), "application/pdf");
      assert.match(download.headers.get("content-disposition") ?? "", /attachment/i);
      const body = Buffer.from(await download.arrayBuffer());
      assert.deepEqual(body, pdf);

      const { rows: countBefore } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      const mcp = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: mcpUpsertBody("Cookie must not write after blob download"),
      });
      assert.equal(mcp.status, 401);
      const { rows: countAfter } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      assert.equal(countAfter[0]?.n, countBefore[0]?.n);
    });

    await t.test("text/html blob from the node page is not a navigable document", async () => {
      const got = await getGraphNode(pool, htmlBlobNote.node.id, { blobs: { dataDir } });
      assert.equal(isToolError(got), false);
      if (isToolError(got) || !got.blob) {
        return;
      }
      const page = await fetch(`${origin}/view/api/nodes/${htmlBlobNote.node.id}`, {
        headers: authHeader(),
      });
      assert.equal(page.status, 200);
      const detail = (await page.json()) as { blob?: { id: string } };
      assert.equal(detail.blob?.id, got.blob.id);

      const cookie = await unlockCookie(origin);
      const cookieAgentPath = await fetch(`${origin}/blobs/${got.blob.id}`, { headers: { cookie } });
      assert.equal(cookieAgentPath.status, 401);

      const headerAgentPath = await fetch(`${origin}/blobs/${got.blob.id}`, {
        headers: authHeader(),
      });
      assert.equal(headerAgentPath.status, 200);
      assert.equal(headerAgentPath.headers.get("content-type"), "application/octet-stream");

      const windowBytes = await fetch(`${origin}/view/blobs/${got.blob.id}`, { headers: { cookie } });
      assert.equal(windowBytes.status, 200);
      assert.equal(windowBytes.headers.get("content-type"), "application/octet-stream");
      assert.match(windowBytes.headers.get("content-disposition") ?? "", /attachment/i);
      assert.equal(windowBytes.headers.get("x-content-type-options"), "nosniff");
      assert.notEqual(windowBytes.headers.get("content-type"), "text/html");
      const body = Buffer.from(await windowBytes.arrayBuffer());
      assert.deepEqual(body, htmlBytes);
    });

    await t.test("a request through the window does not create or change a node", async () => {
      const before = await getGraphNode(pool, note.node.id);
      assert.equal(isToolError(before), false);
      if (isToolError(before)) {
        return;
      }
      const activityBefore = await listGraphActivity(pool, { target: note.node.id, limit: 100 });
      assert.equal(isToolError(activityBefore), false);
      if (isToolError(activityBefore)) {
        return;
      }
      const { rows: countBefore } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );

      const home = await fetch(`${origin}/view/api/search?q=Fixture`, { headers: authHeader() });
      assert.equal(home.status, 200);
      const nodePage = await fetch(`${origin}/view/api/nodes/${note.node.id}`, {
        headers: authHeader(),
      });
      assert.equal(nodePage.status, 200);
      const typed = await fetch(`${origin}/view/api/search?type=note`, { headers: authHeader() });
      assert.equal(typed.status, 200);
      const graph = await fetch(`${origin}/view/api/graph?focus=${note.node.id}`, {
        headers: authHeader(),
      });
      assert.equal(graph.status, 200);

      const after = await getGraphNode(pool, note.node.id);
      assert.equal(isToolError(after), false);
      if (isToolError(after)) {
        return;
      }
      assert.equal(after.node.updated_at, before.node.updated_at);
      assert.equal(after.node.title, before.node.title);
      assert.deepEqual(after.node.data, before.node.data);
      assert.equal(after.edges.length, before.edges.length);

      const activityAfter = await listGraphActivity(pool, { target: note.node.id, limit: 100 });
      assert.equal(isToolError(activityAfter), false);
      if (isToolError(activityAfter)) {
        return;
      }
      assert.equal(activityAfter.activities.length, activityBefore.activities.length);

      const { rows: countAfter } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      assert.equal(countAfter[0]?.n, countBefore[0]?.n);
    });
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await pool.end();
  }
});

test("viewer CSS ships paper first and a real dark lane", async () => {
  const css = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "../../viewer/src/styles.css"),
    "utf8",
  );
  assert.match(css, /--bg:\s*#f7f7f4/);
  assert.match(css, /--ink:\s*#26251e/);
  assert.match(css, /--accent:\s*#f54e00/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /--bg:\s*#14120b/);
  assert.match(css, /--ink:\s*#edecec/);
  assert.match(css, /--card:\s*#1b1913/);
  assert.doesNotMatch(css, /box-shadow|linear-gradient/);
  const dist = viewerDistDir();
  assert.ok(dist.endsWith("viewer/dist"));
});
