import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { createApp } from "./app.js";
import { getGraphNode, linkGraphNodes, listGraphActivity, upsertGraphNode } from "./graph.js";

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
    await t.test("refuses the window without the API key", async () => {
      const home = await fetch(`${origin}/view`);
      assert.equal(home.status, 401);
      assert.match(await home.text(), /API key required/i);

      const node = await fetch(`${origin}/view/nodes/11111111-1111-4111-8111-111111111111`);
      assert.equal(node.status, 401);
    });

    await t.test("succeeds with the API key; empty graph is an empty list", async () => {
      const home = await fetch(`${origin}/view`, { headers: authHeader() });
      assert.equal(home.status, 200);
      const html = await home.text();
      assert.match(html, /Search the graph/);
      assert.doesNotMatch(html, /Internal server error/i);
      assert.doesNotMatch(html, /upsert|unlink|manage_type|confirm: true/i);

      const listed = await fetch(`${origin}/view?type=note`, { headers: authHeader() });
      assert.equal(listed.status, 200);
      const listedHtml = await listed.text();
      assert.match(listedHtml, /No matching nodes/);
      assert.doesNotMatch(listedHtml, /Internal server error/i);
    });

    await t.test("unlock cookie opens the window", async () => {
      const denied = await fetch(`${origin}/view/unlock`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "api_key=nope",
        redirect: "manual",
      });
      assert.equal(denied.status, 401);

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

      const home = await fetch(`${origin}/view`, { headers: { cookie } });
      assert.equal(home.status, 200);

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
      const res = await fetch(`${origin}/view?q=${encodeURIComponent("Fixture due")}&type=task`, {
        headers: authHeader(),
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Fixture due task/);
      assert.match(html, /task/);
      assert.match(html, /due 2026-08-20/);
    });

    await t.test("node page shows title and neighbor titles", async () => {
      const res = await fetch(`${origin}/view/nodes/${note.node.id}`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Fixture note/);
      assert.match(html, /note/);
      assert.match(html, /active/);
      assert.match(html, /fixture payload text/);
      assert.match(html, /Fixture project/);
      assert.match(html, new RegExp(`/view/nodes/${project.node.id}`));
      assert.match(html, /Back to search/);
      assert.doesNotMatch(html, />\s*(Upsert|Delete|Link|Unlink|Undo|Confirm)\s*</i);
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

    await t.test("blob node shows metadata and the existing /blobs path", async () => {
      const got = await getGraphNode(pool, blobNote.node.id, { blobs: { dataDir } });
      assert.equal(isToolError(got), false);
      if (isToolError(got)) {
        return;
      }
      const res = await fetch(`${origin}/view/nodes/${blobNote.node.id}`, { headers: authHeader() });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Fixture blob note/);
      assert.ok(got.blob);
      assert.match(html, new RegExp(got.blob.id));
      assert.match(html, new RegExp(got.blob.sha256));
      assert.match(html, /application\/pdf/);
      assert.match(html, new RegExp(`/blobs/${got.blob.id}`));
    });

    await t.test("text/html blob from the node page is not a navigable document", async () => {
      const got = await getGraphNode(pool, htmlBlobNote.node.id, { blobs: { dataDir } });
      assert.equal(isToolError(got), false);
      if (isToolError(got) || !got.blob) {
        return;
      }
      const page = await fetch(`${origin}/view/nodes/${htmlBlobNote.node.id}`, {
        headers: authHeader(),
      });
      assert.equal(page.status, 200);
      const pageHtml = await page.text();
      assert.match(pageHtml, new RegExp(`/blobs/${got.blob.id}`));

      const cookieOnly = await fetch(`${origin}/blobs/${got.blob.id}`, {
        headers: { cookie: "foundation_key=test-foundation-key" },
      });
      assert.equal(cookieOnly.status, 401);

      const bytes = await fetch(`${origin}/blobs/${got.blob.id}`, { headers: authHeader() });
      assert.equal(bytes.status, 200);
      assert.equal(bytes.headers.get("content-type"), "application/octet-stream");
      assert.match(bytes.headers.get("content-disposition") ?? "", /attachment/i);
      assert.equal(bytes.headers.get("x-content-type-options"), "nosniff");
      assert.notEqual(bytes.headers.get("content-type"), "text/html");
      const body = Buffer.from(await bytes.arrayBuffer());
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

      const home = await fetch(`${origin}/view?q=Fixture`, { headers: authHeader() });
      assert.equal(home.status, 200);
      const nodePage = await fetch(`${origin}/view/nodes/${note.node.id}`, { headers: authHeader() });
      assert.equal(nodePage.status, 200);
      const typed = await fetch(`${origin}/view?type=note`, { headers: authHeader() });
      assert.equal(typed.status, 200);

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
