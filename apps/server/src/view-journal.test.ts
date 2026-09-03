import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AddressInfo, Server } from "node:net";
import { createPool, getNodeById, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError, todayInNewYork } from "@foundation/schema";
import { createApp } from "./app.js";
import { deleteGraphNode, getGraphNode, listGraphActivity, upsertGraphNode } from "./graph.js";
import { DESTRUCTIVE } from "./write-context.js";
import { journalDayTitle, journalMarkdownPayload } from "./view-journal.js";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = "test-foundation-key";

test("journalDayTitle is a calendar day, not a form label", () => {
  assert.equal(journalDayTitle("2026-09-01"), "September 1, 2026");
  assert.equal(journalMarkdownPayload("hello").media_type, "text/markdown");
  assert.equal(journalMarkdownPayload("hello").storage, "inline");
  assert.equal(journalMarkdownPayload("hello").body, "hello");
});

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
  const cookie = (unlock.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(cookie);
  return cookie;
}

test("viewer journal write gate: today, patch, types, if-match, cookie is not MCP", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("journal_view_write");
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-journal-view-"));
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
  const cookie = await unlockCookie(viewOrigin);

  try {
    const peekEmpty = await fetch(`${viewOrigin}/view/api/journals/today`, {
      headers: { cookie },
    });
    assert.equal(peekEmpty.status, 200);
    const peekNone = (await peekEmpty.json()) as { node: null };
    assert.equal(peekNone.node, null);

    const first = await fetch(`${viewOrigin}/view/api/journals/today`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal(first.status, 200);
    const created = (await first.json()) as {
      node: { id: string; type: string; title: string; updated_at: string; payload: { body?: string; media_type: string } };
    };
    assert.equal(created.node.type, "journal");
    assert.equal(created.node.title, journalDayTitle(todayInNewYork()));
    assert.equal(created.node.payload.media_type, "text/markdown");
    assert.equal(created.node.payload.body, "");

    const peekLive = await fetch(`${viewOrigin}/view/api/journals/today`, {
      headers: { cookie },
    });
    assert.equal(peekLive.status, 200);
    const peeked = (await peekLive.json()) as { node: { id: string } };
    assert.equal(peeked.node.id, created.node.id);

    const again = await fetch(`${viewOrigin}/view/api/journals/today`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal(again.status, 200);
    const same = (await again.json()) as { node: { id: string } };
    assert.equal(same.node.id, created.node.id);

    const body = "# Morning\n\nWrote in the window.\n";
    const saved = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Morning",
        body,
        base_updated_at: created.node.updated_at,
      }),
    });
    assert.equal(saved.status, 200);
    const after = (await saved.json()) as {
      node: { title: string; updated_at: string; payload: { body?: string; media_type: string; storage: string } };
    };
    assert.equal(after.node.title, "Morning");
    assert.equal(after.node.payload.body, body);
    assert.equal(after.node.payload.media_type, "text/markdown");
    assert.equal(after.node.payload.storage, "inline");

    const got = await getGraphNode(pool, created.node.id);
    assert.equal(isToolError(got), false);
    if (!isToolError(got)) {
      assert.equal(got.node.payload.body, body);
      assert.equal(got.node.payload.media_type, "text/markdown");
    }

    const activity = await listGraphActivity(pool, { target: created.node.id, limit: 10 });
    assert.equal(isToolError(activity), false);
    if (!isToolError(activity)) {
      assert.ok(activity.activities.some((row) => row.actor === "user" && row.actor_label === "Viewer"));
    }

    const clash = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Should not land",
        body: "lost",
        base_updated_at: created.node.updated_at,
      }),
    });
    assert.equal(clash.status, 409);
    const still = await getGraphNode(pool, created.node.id);
    assert.equal(isToolError(still), false);
    if (!isToolError(still)) {
      assert.equal(still.node.title, "Morning");
      assert.equal(still.node.payload.body, body);
    }

    const note = await upsertGraphNode(pool, { type: "note", title: "Fixture note" });
    assert.equal(isToolError(note), false);
    if (!isToolError(note)) {
      const refused = await fetch(`${viewOrigin}/view/api/nodes/${note.node.id}`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          title: "Hijack",
          body: "no",
          base_updated_at: note.node.updated_at,
        }),
      });
      assert.equal(refused.status, 403);
      const noteAfter = await getGraphNode(pool, note.node.id);
      assert.equal(isToolError(noteAfter), false);
      if (!isToolError(noteAfter)) {
        assert.equal(noteAfter.node.title, "Fixture note");
      }
    }

    const mcpWithCookie = await fetch(`${viewOrigin}/mcp`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(mcpWithCookie.status, 403);
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await new Promise<void>((resolve) => viewServer.close(() => resolve()));
    await pool.end();
  }
});

test("Today after a deleted same-day journal makes a new entry", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("journal_view_today_after_delete");
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-journal-today-"));
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
  const viewOrigin = await listenOrigin(viewServer);
  const cookie = await unlockCookie(viewOrigin);

  try {
    const first = await fetch(`${viewOrigin}/view/api/journals/today`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal(first.status, 200);
    const created = (await first.json()) as {
      node: { id: string; updated_at: string; payload: { body?: string } };
    };
    const written = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Morning",
        body: "Kept on the deleted record.\n",
        base_updated_at: created.node.updated_at,
      }),
    });
    assert.equal(written.status, 200);
    const saved = (await written.json()) as { node: { updated_at: string } };

    const removed = await deleteGraphNode(pool, {
      id: created.node.id,
      base_updated_at: saved.node.updated_at,
    }, DESTRUCTIVE);
    assert.equal(isToolError(removed), false);
    const gone = await getGraphNode(pool, created.node.id);
    assert.equal(isToolError(gone), true);

    const again = await fetch(`${viewOrigin}/view/api/journals/today`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal(again.status, 200);
    const next = (await again.json()) as {
      node: { id: string; type: string; payload: { body?: string; media_type: string } };
    };
    assert.equal(next.node.type, "journal");
    assert.notEqual(next.node.id, created.node.id);
    assert.equal(next.node.payload.media_type, "text/markdown");
    assert.equal(next.node.payload.body, "");

    const tomb = await getNodeById(pool, created.node.id, { includeDeleted: true });
    assert.ok(tomb?.deleted_at);
    assert.equal(tomb?.payload.body, "Kept on the deleted record.\n");

    const live = await getGraphNode(pool, next.node.id);
    assert.equal(isToolError(live), false);
    if (!isToolError(live)) {
      assert.equal(live.node.payload.body, "");
    }

    const third = await fetch(`${viewOrigin}/view/api/journals/today`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
    });
    assert.equal(third.status, 200);
    const same = (await third.json()) as { node: { id: string } };
    assert.equal(same.node.id, next.node.id);
  } finally {
    await new Promise<void>((resolve) => viewServer.close(() => resolve()));
    await pool.end();
  }
});
