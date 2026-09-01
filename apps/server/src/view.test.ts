import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  applyViewQuery,
  asViewDeclarations,
  findViewDeclaration,
  isToolError,
  type TypeField,
  type ViewDeclaration,
} from "@foundation/schema";
import type { AddressInfo, Server } from "node:net";
import { createApp } from "./app.js";
import { getGraphNode, inspectOntology, linkGraphNodes, listGraphActivity, manageType, upsertGraphNode } from "./graph.js";
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

async function listenOrigin(server: Server): Promise<string> {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  }
  const address = server.address() as AddressInfo | null;
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
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
  const bindings = {
    FOUNDATION_API_KEY: apiKey,
    DATABASE_URL: databaseUrl,
    FOUNDATION_DATA: dataDir,
    PORT: 0,
    HOST: "127.0.0.1",
    VIEW_PORT: 0,
    VIEW_HOST: "0.0.0.0",
  };
  const mcpApp = createApp(pool, bindings, "mcp");
  const viewApp = createApp(pool, bindings, "view");
  const httpServer = mcpApp.listen(0);
  const viewServer = viewApp.listen(0);
  const origin = await listenOrigin(httpServer);
  const viewOrigin = await listenOrigin(viewServer);

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
      assert.match(js, /Unlock\./);
      assert.match(js, /That key did not unlock/);
      assert.match(js, /Write today/);
      assert.doesNotMatch(js, /Unlock the vault window/);
      assert.doesNotMatch(js, /Same key as MCP/);
      assert.match(js, /No open tasks/);
      assert.match(js, /No views declared for this type/);
      assert.match(js, /Open tasks/);
      assert.match(js, /Show completed/);
      assert.match(js, /No date field on this type/);
      assert.match(js, /min-h-\[460px\]/);
      assert.match(js, /detail-page/);
      assert.match(js, /View all/);
      assert.doesNotMatch(js, /manage_type|confirm: true|localhost-only/);
      assert.doesNotMatch(js, /Select a node/);

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

      const ontology = await fetch(`${origin}/view/api/ontology`, { headers: authHeader() });
      assert.equal(ontology.status, 200);
      const ontologyBody = (await ontology.json()) as {
        types: Array<{ slug: string; views: string[]; default_view?: string; count: number; hue?: string; glyph?: string }>;
      };
      const taskType = ontologyBody.types.find((type) => type.slug === "task");
      assert.deepEqual(taskType?.views, ["board", "list", "calendar", "timeline", "outline"]);
      assert.equal(taskType?.default_view, "board");
      assert.equal(taskType?.count, 0);
      assert.equal(taskType?.hue, "green");
      assert.equal(taskType?.glyph, "CircleCheck");
      const noteType = ontologyBody.types.find((type) => type.slug === "note");
      assert.deepEqual(noteType?.views, ["list"]);
      assert.equal(noteType?.default_view, "list");

      const typeView = await fetch(`${origin}/view/api/types/task`, { headers: authHeader() });
      assert.equal(typeView.status, 200);
      const typeBody = (await typeView.json()) as {
        type: { views: Array<string | { id: string }>; default_view?: string; fields?: Array<{ name: string }> };
        nodes: unknown[];
      };
      assert.deepEqual(
        typeBody.type.views.map((view) => (typeof view === "string" ? view : view.id)),
        ["board", "list", "calendar", "timeline", "outline"],
      );
      assert.equal(typeBody.type.default_view, "board");
      assert.deepEqual(typeBody.type.fields?.map((field) => field.name), ["due"]);
      assert.deepEqual(typeBody.nodes, []);

      const blank = await manageType(pool, { action: "create", slug: "blank_view", kind: "artifact" });
      assert.equal(isToolError(blank), false);
      const blankView = await fetch(`${origin}/view/api/types/blank_view`, { headers: authHeader() });
      assert.equal(blankView.status, 200);
      const blankBody = (await blankView.json()) as { type: { views: Array<string | { id: string }>; default_view?: string } };
      assert.deepEqual(blankBody.type.views, []);
      assert.equal(blankBody.type.default_view, undefined);
    });

    await t.test("unlock cookie opens the window", async () => {
      const denied = await fetch(`${origin}/view/unlock`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "api_key=nope",
        redirect: "manual",
      });
      assert.equal(denied.status, 401);
      assert.match(await denied.text(), /That key did not unlock/);

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

    await t.test("host MCP attach bootstraps and searches", async () => {
      const bootstrap = await fetch(`${origin}/mcp`, {
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
      assert.equal(bootstrap.status, 200);

      const search = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          ...authHeader(),
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "search", arguments: { type: "area" } },
        }),
      });
      assert.equal(search.status, 200);
    });

    await t.test("off-box Host can unlock the view door and cannot use the cookie on /mcp", async () => {
      const offbox = "192.168.10.20:8788";
      const denied = await fetch(`${viewOrigin}/view/api/session`, { headers: { host: offbox } });
      assert.equal(denied.status, 401);

      const unlock = await fetch(`${viewOrigin}/view/unlock`, {
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

      const session = await fetch(`${viewOrigin}/view/api/session`, {
        headers: { host: offbox, cookie },
      });
      assert.equal(session.status, 200);

      const graph = await fetch(`${viewOrigin}/view/api/graph`, { headers: { host: offbox, cookie } });
      assert.equal(graph.status, 200);

      const mcpOnView = await fetch(`${viewOrigin}/mcp`, {
        method: "POST",
        headers: {
          host: "127.0.0.1",
          cookie,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: mcpUpsertBody("View door cookie must not write"),
      });
      assert.equal(mcpOnView.status, 403);

      const mcpOnMcp = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: mcpUpsertBody("Off-box cookie must not write"),
      });
      assert.equal(mcpOnMcp.status, 401);
    });

    await t.test("view door refuses /mcp and /blobs even with localhost Host and API key", async () => {
      const { rows: countBefore } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      for (const host of ["127.0.0.1", "localhost"]) {
        const mcp = await fetch(`${viewOrigin}/mcp`, {
          method: "POST",
          headers: {
            ...authHeader(),
            host,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: mcpUpsertBody("View door must not write"),
        });
        assert.equal(mcp.status, 403);

        const blob = await fetch(`${viewOrigin}/blobs/11111111-1111-4111-8111-111111111111`, {
          headers: { ...authHeader(), host },
        });
        assert.equal(blob.status, 403);
      }
      const { rows: countAfter } = await pool.query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
      );
      assert.equal(countAfter[0]?.n, countBefore[0]?.n);
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

    await t.test("graph includes live nodes and live relations", async () => {
      const hierarchy = await linkGraphNodes(pool, {
        from_id: dueTask.node.id,
        to_id: project.node.id,
        relation_type: "child_of",
        from_base_updated_at: dueTask.node.updated_at,
        to_base_updated_at: project.node.updated_at,
      });
      assert.equal(isToolError(hierarchy), false);

      const res = await fetch(`${origin}/view/api/graph`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        nodes: Array<{ title: string }>;
        edges: Array<{ from: string; to: string; relation_type: string; kind: string }>;
      };
      const titles = body.nodes.map((node) => node.title);
      assert.ok(titles.includes("Fixture note"));
      assert.ok(titles.includes("Fixture project"));
      assert.ok(titles.includes("Fixture due task"));
      assert.ok(
        body.edges.some(
          (edge) =>
            edge.relation_type === "relates_to" &&
            edge.kind === "associative" &&
            (edge.from === note.node.id || edge.to === note.node.id),
        ),
      );
      assert.ok(
        body.edges.some(
          (edge) =>
            edge.relation_type === "child_of" &&
            edge.kind === "hierarchy" &&
            edge.from === dueTask.node.id &&
            edge.to === project.node.id,
        ),
      );

      const write = await fetch(`${origin}/view/api/graph`, {
        method: "POST",
        headers: { ...authHeader(), "content-type": "application/json" },
        body: JSON.stringify({ title: "must not write" }),
      });
      assert.equal(write.status, 404);
    });

    await t.test("ancestors are root to parent", async () => {
      const area = await upsertGraphNode(pool, { type: "area", title: "Fixture area" });
      assert.equal(isToolError(area), false);
      if (isToolError(area)) {
        return;
      }
      const hung = await linkGraphNodes(pool, {
        from_id: project.node.id,
        to_id: area.node.id,
        relation_type: "child_of",
        from_base_updated_at: project.node.updated_at,
        to_base_updated_at: area.node.updated_at,
      });
      assert.equal(isToolError(hung), false);

      const res = await fetch(`${origin}/view/api/nodes/${dueTask.node.id}`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ancestors: Array<{ title: string }> };
      assert.deepEqual(
        body.ancestors.map((item) => item.title),
        ["Fixture area", "Fixture project"],
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

    await t.test("tasks board lists the fixture task; widget cap is 5 in due order", async () => {
      const res = await fetch(`${origin}/view/api/tasks`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        tasks: Array<{ title: string; status: string; due?: string }>;
      };
      const task = body.tasks.find((item) => item.title === "Fixture due task");
      assert.ok(task);
      assert.equal(task.status, "active");
      assert.equal(task.due, "2026-08-20");

      await upsertGraphNode(pool, { type: "task", title: "Widget overdue old", data: { due: "2020-01-01" } });
      await upsertGraphNode(pool, { type: "task", title: "Widget overdue new", data: { due: "2020-06-01" } });
      await upsertGraphNode(pool, { type: "task", title: "Widget upcoming far", data: { due: "2099-01-01" } });
      await upsertGraphNode(pool, { type: "task", title: "Widget undated a" });
      await upsertGraphNode(pool, { type: "task", title: "Widget undated b" });
      await upsertGraphNode(pool, { type: "task", title: "Widget undated c" });
      const completed = await upsertGraphNode(pool, {
        type: "task",
        title: "Widget completed overdue",
        status: "completed",
        data: { due: "2019-01-01" },
      });
      const archived = await upsertGraphNode(pool, {
        type: "task",
        title: "Widget archived overdue",
        status: "archived",
        data: { due: "2019-06-01" },
      });
      assert.equal(isToolError(completed), false);
      assert.equal(isToolError(archived), false);

      const limited = await fetch(`${origin}/view/api/tasks?limit=5`, { headers: authHeader() });
      assert.equal(limited.status, 200);
      const limitedBody = (await limited.json()) as {
        tasks: Array<{ title: string; status?: string; due?: string }>;
      };
      assert.equal(limitedBody.tasks.length, 5);
      assert.ok(limitedBody.tasks.every((item) => item.status === "active"));
      assert.ok(!limitedBody.tasks.some((item) => item.title === "Widget completed overdue"));
      assert.ok(!limitedBody.tasks.some((item) => item.title === "Widget archived overdue"));
      assert.deepEqual(
        limitedBody.tasks.map((item) => item.title),
        [
          "Widget overdue old",
          "Widget overdue new",
          "Fixture due task",
          "Widget upcoming far",
          "Widget undated a",
        ],
      );
    });

    await t.test("recents are non-task objects; widget cap is 5, newest first", async () => {
      for (let i = 0; i < 6; i += 1) {
        const created = await upsertGraphNode(pool, { type: "note", title: `Widget recent ${i}` });
        assert.equal(isToolError(created), false);
      }
      // Insert alpha first so created_at DESC would put zebra first; title ASC puts alpha first.
      const olderTie = await upsertGraphNode(pool, { type: "note", title: "Recents tie alpha" });
      assert.equal(isToolError(olderTie), false);
      if (isToolError(olderTie)) {
        return;
      }
      const newerTie = await upsertGraphNode(pool, { type: "note", title: "Recents tie zebra" });
      assert.equal(isToolError(newerTie), false);
      if (isToolError(newerTie)) {
        return;
      }
      await pool.query(
        `UPDATE nodes
         SET updated_at = date_trunc('milliseconds', timestamptz '2099-01-01 00:00:00+00')
         WHERE id = ANY($1::uuid[])`,
        [[olderTie.node.id, newerTie.node.id]],
      );

      const res = await fetch(`${origin}/view/api/recents?limit=5`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        rows: Array<{ title: string; type: string; updated_at: string }>;
      };
      assert.equal(body.rows.length, 5);
      assert.ok(body.rows.every((row) => row.type !== "task"));
      assert.equal(body.rows[0]?.updated_at, body.rows[1]?.updated_at);
      assert.deepEqual(
        body.rows.slice(0, 2).map((row) => row.title),
        ["Recents tie alpha", "Recents tie zebra"],
      );
      assert.ok(body.rows.some((row) => row.title.startsWith("Widget recent")));
      for (let i = 1; i < body.rows.length; i += 1) {
        assert.ok(body.rows[i - 1]!.updated_at >= body.rows[i]!.updated_at);
      }

      const all = await fetch(`${origin}/view/api/recents`, { headers: authHeader() });
      const allBody = (await all.json()) as { rows: Array<{ title: string; type: string }> };
      assert.ok(allBody.rows.every((row) => row.type !== "task"));
      assert.ok(allBody.rows.some((row) => row.title === "Fixture note"));
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

      const offbox = "192.168.10.20:8788";
      const offboxCookie = await unlockCookie(viewOrigin);
      const offboxDownload = await fetch(`${viewOrigin}/view/blobs/${got.blob.id}`, {
        headers: { host: offbox, cookie: offboxCookie },
      });
      assert.equal(offboxDownload.status, 200);
      assert.equal(offboxDownload.headers.get("content-type"), "application/pdf");
      assert.deepEqual(Buffer.from(await offboxDownload.arrayBuffer()), pdf);

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

      const offbox = "192.168.10.20:8788";
      const offboxCookie = await unlockCookie(viewOrigin);
      const offboxDownload = await fetch(`${viewOrigin}/view/blobs/${got.blob.id}`, {
        headers: { host: offbox, cookie: offboxCookie },
      });
      assert.equal(offboxDownload.status, 200);
      assert.match(offboxDownload.headers.get("content-disposition") ?? "", /attachment/i);

      for (const host of ["127.0.0.1", "localhost"]) {
        const spoofed = await fetch(`${viewOrigin}/blobs/${got.blob.id}`, {
          headers: {
            cookie: offboxCookie,
            host,
            ...authHeader(),
          },
        });
        assert.equal(spoofed.status, 403);
      }

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
    await new Promise<void>((resolve) => viewServer.close(() => resolve()));
    await pool.end();
  }
});

test(
  "manage_type default filter drives collection and Home Open tasks",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("view_default_filter");
    const dataDir = await mkdtemp(join(tmpdir(), "foundation-view-filter-"));
    const bindings = {
      FOUNDATION_API_KEY: apiKey,
      DATABASE_URL: databaseUrl,
      FOUNDATION_DATA: dataDir,
      PORT: 0,
      HOST: "127.0.0.1",
      VIEW_PORT: 0,
      VIEW_HOST: "0.0.0.0",
    };
    const viewApp = createApp(pool, bindings, "view");
    const viewServer = viewApp.listen(0);
    try {
      const viewOrigin = await listenOrigin(viewServer);
      const cookie = await unlockCookie(viewOrigin);

      const open = await upsertGraphNode(pool, { type: "task", title: "Open one", status: "active" });
      const done = await upsertGraphNode(pool, { type: "task", title: "Done one", status: "completed" });
      const archived = await upsertGraphNode(pool, { type: "task", title: "Archived one", status: "archived" });
      assert.equal(isToolError(open), false);
      assert.equal(isToolError(done), false);
      assert.equal(isToolError(archived), false);

      const beforeTasks = await fetch(`${viewOrigin}/view/api/tasks`, { headers: { cookie } });
      const beforeTaskBody = (await beforeTasks.json()) as { tasks: Array<{ title: string }> };
      assert.deepEqual(
        beforeTaskBody.tasks.map((task) => task.title).sort(),
        ["Open one"],
      );

      const beforeType = await fetch(`${viewOrigin}/view/api/types/task`, { headers: { cookie } });
      const beforeTypeBody = (await beforeType.json()) as {
        type: { views: ViewDeclaration[]; default_view?: string; fields?: TypeField[] };
        nodes: Array<{ id: string; title: string; status: string; data?: Record<string, unknown> }>;
      };
      const beforeView = findViewDeclaration(
        asViewDeclarations(beforeTypeBody.type.views),
        beforeTypeBody.type.default_view ?? "board",
      );
      assert.ok(beforeView);
      const beforeCollection = applyViewQuery(
        beforeTypeBody.nodes.map((node) => ({ ...node, data: node.data ?? {} })),
        beforeView,
        beforeTypeBody.type.fields ?? [],
      );
      assert.deepEqual(
        beforeCollection.map((node) => node.title).sort(),
        ["Open one"],
      );

      const types = await inspectOntology(pool, "types");
      const task = types.types.find((type) => type.slug === "task");
      assert.ok(task);
      const views = (task.views ?? []).map((view) =>
        view.id === task.default_view
          ? {
              ...view,
              filter: { clauses: [{ bind: "status" as const, op: "in" as const, value: ["active", "completed"] }] },
            }
          : view,
      );
      const patched = await manageType(pool, { action: "update", slug: "task", views });
      assert.equal(isToolError(patched), false);

      const afterTasks = await fetch(`${viewOrigin}/view/api/tasks`, { headers: { cookie } });
      const afterTaskBody = (await afterTasks.json()) as { tasks: Array<{ title: string }> };
      assert.deepEqual(
        afterTaskBody.tasks.map((task) => task.title).sort(),
        ["Done one", "Open one"],
      );

      const afterType = await fetch(`${viewOrigin}/view/api/types/task`, { headers: { cookie } });
      const afterTypeBody = (await afterType.json()) as {
        type: { views: ViewDeclaration[]; default_view?: string; fields?: TypeField[] };
        nodes: Array<{ id: string; title: string; status: string; data?: Record<string, unknown> }>;
      };
      const afterView = findViewDeclaration(
        asViewDeclarations(afterTypeBody.type.views),
        afterTypeBody.type.default_view ?? "board",
      );
      assert.ok(afterView);
      const afterCollection = applyViewQuery(
        afterTypeBody.nodes.map((node) => ({ ...node, data: node.data ?? {} })),
        afterView,
        afterTypeBody.type.fields ?? [],
      );
      assert.deepEqual(
        afterCollection.map((node) => node.title).sort(),
        ["Done one", "Open one"],
      );

      const person = await upsertGraphNode(pool, {
        type: "person",
        title: "Ada",
        data: { org: "Labs", secret: "hidden" },
      });
      assert.equal(isToolError(person), false);
      const personView = await fetch(`${viewOrigin}/view/api/types/person`, { headers: { cookie } });
      const personBody = (await personView.json()) as {
        nodes: Array<{ title: string; chips?: Array<{ name: string; value: string }>; due?: string }>;
      };
      const ada = personBody.nodes.find((node) => node.title === "Ada");
      assert.deepEqual(ada?.chips, [{ name: "org", display: "Org", value: "Labs" }]);
      assert.equal(ada?.due, undefined);
    } finally {
      await new Promise<void>((resolve) => viewServer.close(() => resolve()));
      await pool.end();
    }
  },
);

test("view window writes journal only; still 14 tools", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const view = await readFile(join(here, "view.ts"), "utf8");
  const posts = [...view.matchAll(/app\.post\(/g)];
  assert.equal(posts.length, 2);
  assert.match(view, /app\.post\(`\$\{VIEW_PATH\}\/unlock`/);
  assert.match(view, /app\.get\(`\$\{VIEW_PATH\}\/api\/journals\/today`/);
  assert.match(view, /app\.post\(`\$\{VIEW_PATH\}\/api\/journals\/today`/);
  assert.match(view, /app\.patch\(`\$\{VIEW_PATH\}\/api\/nodes\/:id`/);
  assert.match(view, /app\.get\(`\$\{VIEW_PATH\}\/api\/graph`/);
  assert.match(view, /app\.get\(`\$\{VIEW_PATH\}\/api\/recents`/);
  const register = await readFile(join(here, "tools/register.ts"), "utf8");
  const names = [...register.matchAll(/register(\w+)Tool\(server/g)].map((match) => match[1]);
  assert.equal(names.length, 14);
  assert.ok(names.includes("WorkingSet"));
});

test("viewer CSS ships dark first and a real light lane", async () => {
  const css = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "../../viewer/src/styles.css"),
    "utf8",
  );
  assert.match(css, /--canvas:\s*#0a0a0a/);
  assert.match(css, /--ink:\s*#ffffff/);
  assert.match(css, /--elevated:\s*#171717/);
  assert.match(css, /--accent:\s*#ffffff/);
  assert.match(css, /--primary:\s*#ffffff/);
  assert.match(css, /\[data-theme="light"\]/);
  assert.match(css, /--canvas:\s*#fafafa/);
  assert.match(css, /--ink:\s*#171717/);
  assert.match(css, /--elevated:\s*#ffffff/);
  assert.match(css, /--accent:\s*#171717/);
  assert.doesNotMatch(css, /#f54e00/);
  assert.doesNotMatch(css, /#f7f7f4/);
  assert.doesNotMatch(css, /linear-gradient/);
  const dist = viewerDistDir();
  assert.ok(dist.endsWith("viewer/dist"));
});
