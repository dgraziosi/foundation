import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AddressInfo, Server } from "node:net";
import { createPool, getNodeById, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { createApp } from "./app.js";
import { getGraphNode, upsertGraphNode } from "./graph.js";
import { activityChangeSummary, pickEditableData, presentViewActivity } from "./view-write.js";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = "test-foundation-key";

test("pickEditableData keeps declared scalars and drops refs", () => {
  const fields = [
    { name: "org", display: "Org", kind: "string" as const, needed: false },
    { name: "who", display: "Who", kind: "ref" as const, needed: false, ref_type: "person" },
    { name: "stage", display: "Stage", kind: "enum" as const, needed: true, enum_values: ["quoted", "paid"] },
  ];
  assert.deepEqual(pickEditableData(fields, { org: "Labs", who: "11111111-1111-4111-8111-111111111111", extra: 1 }), {
    org: "Labs",
  });
  assert.deepEqual(pickEditableData(fields, { stage: "quoted" }), { stage: "quoted" });
  assert.equal(pickEditableData(fields, { who: "11111111-1111-4111-8111-111111111111" }), undefined);
});

test("activityChangeSummary names title, status, and data keys", () => {
  assert.equal(activityChangeSummary({ action: "create", before: null, after: { title: "Ada" } }), "Created");
  assert.equal(activityChangeSummary({ action: "delete", before: { title: "Ada" }, after: { title: "Ada" } }), "Moved to trash");
  assert.equal(
    activityChangeSummary({
      action: "update",
      before: { title: "Ada", status: "active", data: { org: "Labs" } },
      after: { title: "Ada Lovelace", status: "completed", data: { org: "College" } },
    }),
    "title, status, data.org",
  );
});

test("presentViewActivity never offers undo on a restore row", () => {
  const stamp = "2026-09-01T12:00:00.000Z";
  const live = {
    id: "11111111-1111-4111-8111-111111111111",
    type: "person",
    title: "Ada",
    status: "active" as const,
    payload: { media_type: "text/plain", storage: "inline" as const, body: "" },
    data: {},
    metadata: {},
    created_at: stamp,
    updated_at: stamp,
    deleted_at: null,
  };
  const presented = presentViewActivity(
    {
      id: "22222222-2222-4222-8222-222222222222",
      actor: "user",
      actor_label: "Viewer",
      action: "restore",
      target_kind: "node",
      target_id: live.id,
      before: { ...live, deleted_at: stamp },
      after: live,
      reversible: true,
      undo_token: "33333333-3333-4333-8333-333333333333",
      token_expires_at: "2099-01-01T00:00:00.000Z",
      undone_at: null,
      rationale: null,
      created_at: stamp,
      schema_version: 1,
    },
    live,
  );
  assert.equal(presented.can_undo, false);
  assert.equal(presented.summary, "Restored");
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

test("viewer any-node write, activity undo, and trash restore", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("view_any_node_write");
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-view-write-"));
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
    const created = await upsertGraphNode(pool, {
      type: "person",
      title: "Ada",
      status: "active",
      data: { org: "Labs" },
    });
    assert.equal(isToolError(created), false);
    if (isToolError(created)) {
      return;
    }

    const emptyTitle = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "   ", base_updated_at: created.node.updated_at }),
    });
    assert.equal(emptyTitle.status, 400);
    assert.match(await emptyTitle.text(), /Title is required/);

    const saved = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Ada Lovelace",
        status: "completed",
        data: { org: "College" },
        base_updated_at: created.node.updated_at,
      }),
    });
    assert.equal(saved.status, 200);
    const after = (await saved.json()) as {
      node: { title: string; status: string; data: { org?: string }; updated_at: string };
    };
    assert.equal(after.node.title, "Ada Lovelace");
    assert.equal(after.node.status, "completed");
    assert.equal(after.node.data.org, "College");

    const recents = await fetch(`${viewOrigin}/view/api/recents`, { headers: { cookie } });
    assert.equal(recents.status, 200);
    const recentRows = (await recents.json()) as { rows: Array<{ id: string; title: string }> };
    assert.ok(recentRows.rows.some((row) => row.id === created.node.id && row.title === "Ada Lovelace"));

    const clash = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Should not land",
        status: "archived",
        data: { org: "Clobber" },
        base_updated_at: created.node.updated_at,
      }),
    });
    assert.equal(clash.status, 409);
    const still = await getGraphNode(pool, created.node.id);
    assert.equal(isToolError(still), false);
    if (!isToolError(still)) {
      assert.equal(still.node.title, "Ada Lovelace");
      assert.equal(still.node.status, "completed");
      assert.equal((still.node.data as { org?: string }).org, "College");
    }

    const activity = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}/activity`, {
      headers: { cookie },
    });
    assert.equal(activity.status, 200);
    const listed = (await activity.json()) as {
      rows: Array<{
        id: string;
        action: string;
        actor: string;
        actor_label: string | null;
        summary: string;
        can_undo: boolean;
        base_updated_at?: string;
      }>;
    };
    const updateRow = listed.rows.find((row) => row.action === "update" && row.can_undo);
    assert.ok(updateRow);
    assert.equal(updateRow.actor, "user");
    assert.equal(updateRow.actor_label, "Viewer");
    assert.match(updateRow.summary, /title/);
    assert.ok(updateRow.base_updated_at);

    const staleUndo = await fetch(`${viewOrigin}/view/api/activity/${updateRow.id}/undo`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: created.node.updated_at }),
    });
    assert.equal(staleUndo.status, 409);

    const undone = await fetch(`${viewOrigin}/view/api/activity/${updateRow.id}/undo`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: updateRow.base_updated_at }),
    });
    assert.equal(undone.status, 200);
    const restoredEdit = (await undone.json()) as {
      node: { title: string; status: string; data: { org?: string }; updated_at: string };
    };
    assert.equal(restoredEdit.node.title, "Ada");
    assert.equal(restoredEdit.node.status, "active");
    assert.equal(restoredEdit.node.data.org, "Labs");

    const emptyTrash = await fetch(`${viewOrigin}/view/api/trash`, { headers: { cookie } });
    assert.equal(emptyTrash.status, 200);
    const emptyRows = (await emptyTrash.json()) as { rows: unknown[] };
    assert.equal(emptyRows.rows.length, 0);

    const removed = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "DELETE",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: restoredEdit.node.updated_at }),
    });
    assert.equal(removed.status, 200);

    const gone = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, { headers: { cookie } });
    assert.equal(gone.status, 404);

    const afterRecents = await fetch(`${viewOrigin}/view/api/recents`, { headers: { cookie } });
    const afterRecentRows = (await afterRecents.json()) as { rows: Array<{ id: string }> };
    assert.equal(afterRecentRows.rows.some((row) => row.id === created.node.id), false);

    const trash = await fetch(`${viewOrigin}/view/api/trash`, { headers: { cookie } });
    assert.equal(trash.status, 200);
    const trashRows = (await trash.json()) as {
      rows: Array<{ id: string; type: string; title: string; deleted_at: string; updated_at: string }>;
    };
    const dumped = trashRows.rows.find((row) => row.id === created.node.id);
    assert.ok(dumped);
    assert.equal(dumped.type, "person");
    assert.equal(dumped.title, "Ada");
    assert.ok(dumped.deleted_at);
    assert.ok(dumped.updated_at);

    const tomb = await getGraphNode(pool, created.node.id);
    assert.equal(isToolError(tomb), true);

    const deleted = await getNodeById(pool, created.node.id, { includeDeleted: true });
    assert.ok(deleted?.deleted_at);

    const broughtBack = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}/restore`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: deleted.updated_at }),
    });
    assert.equal(broughtBack.status, 200);
    const liveAgain = (await broughtBack.json()) as {
      node: { id: string; title: string; updated_at: string };
    };
    assert.equal(liveAgain.node.id, created.node.id);
    assert.equal(liveAgain.node.title, "Ada");

    const liveRecents = await fetch(`${viewOrigin}/view/api/recents`, { headers: { cookie } });
    const liveRecentRows = (await liveRecents.json()) as { rows: Array<{ id: string }> };
    assert.ok(liveRecentRows.rows.some((row) => row.id === created.node.id));

    const removedAgain = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "DELETE",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: liveAgain.node.updated_at }),
    });
    assert.equal(removedAgain.status, 200);
    const expiredTomb = await getNodeById(pool, created.node.id, { includeDeleted: true });
    assert.ok(expiredTomb?.deleted_at);
    await pool.query(
      `UPDATE activity SET token_expires_at = now() - interval '1 hour' WHERE target_id = $1 AND action = 'delete'`,
      [created.node.id],
    );
    const fallbackRestore = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}/restore`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ base_updated_at: expiredTomb.updated_at }),
    });
    assert.equal(fallbackRestore.status, 200);
    const afterFallback = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}/activity`, {
      headers: { cookie },
    });
    assert.equal(afterFallback.status, 200);
    const fallbackListed = (await afterFallback.json()) as {
      rows: Array<{ action: string; can_undo: boolean }>;
    };
    const restoreRows = fallbackListed.rows.filter((row) => row.action === "restore");
    assert.ok(restoreRows.length > 0);
    assert.ok(restoreRows.every((row) => row.can_undo === false));
    const liveFallback = (await fallbackRestore.json()) as { node: { updated_at: string } };

    const journalBodyOnPerson = await fetch(`${viewOrigin}/view/api/nodes/${created.node.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Hijack",
        body: "no",
        base_updated_at: liveFallback.node.updated_at,
      }),
    });
    assert.equal(journalBodyOnPerson.status, 403);
  } finally {
    await new Promise<void>((resolve) => viewServer.close(() => resolve()));
    await pool.end();
  }
});
