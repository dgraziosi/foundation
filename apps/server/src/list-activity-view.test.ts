import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { ACTIVITY_SCHEMA_VERSION, isToolError } from "@foundation/schema";
import { listGraphActivity, undoGraphActivity, upsertGraphNode } from "./graph.js";
import { DESTRUCTIVE } from "./write-context.js";

const databaseUrl = process.env.DATABASE_URL;

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

test("list_activity fields, diff_only, and schema_version", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("list_activity_view");
  try {
    const created = await upsertGraphNode(pool, {
      type: "note",
      title: "diary note",
      payload: { media_type: "text/plain", storage: "inline", body: "v1" },
    });
    assert.equal(isToolError(created), false);
    if (isToolError(created)) {
      return;
    }
    const updated = await upsertGraphNode(pool, {
      id: created.node.id,
      type: "note",
      title: "diary note two",
      payload: { media_type: "text/plain", storage: "inline", body: "v2" },
      base_updated_at: created.node.updated_at,
    });
    assert.equal(isToolError(updated), false);
    if (isToolError(updated)) {
      return;
    }

    await t.test("default list keeps full snapshots and stamps schema_version", async () => {
      const page = await listGraphActivity(pool, { target: created.node.id, action: "update" });
      assert.equal(isToolError(page), false);
      if (isToolError(page)) {
        return;
      }
      assert.equal(page.count, 1);
      const row = page.activities[0];
      assert.ok(row);
      assert.equal(row.schema_version, ACTIVITY_SCHEMA_VERSION);
      assert.equal(row.action, "update");
      assert.equal(typeof row.before, "object");
      assert.equal(typeof row.after, "object");
      const before = row.before as { title?: string; payload?: { body?: string } };
      const after = row.after as { title?: string; payload?: { body?: string } };
      assert.equal(before.title, "diary note");
      assert.equal(after.title, "diary note two");
      assert.equal(before.payload?.body, "v1");
      assert.equal(after.payload?.body, "v2");
      assert.equal(typeof row.undo_token, "string");
    });

    await t.test("fields returns only the asked keys", async () => {
      const page = await listGraphActivity(pool, {
        target: created.node.id,
        action: "update",
        fields: ["id", "action", "schema_version"],
      });
      assert.equal(isToolError(page), false);
      if (isToolError(page)) {
        return;
      }
      assert.deepEqual(Object.keys(page.activities[0] ?? {}).sort(), [
        "action",
        "id",
        "schema_version",
      ]);
      assert.equal(page.activities[0]?.action, "update");
      assert.equal(page.activities[0]?.schema_version, ACTIVITY_SCHEMA_VERSION);
    });

    await t.test("diff_only returns changed snapshot keys and leaves undo on the full row", async () => {
      const page = await listGraphActivity(pool, {
        target: created.node.id,
        action: "update",
        diff_only: true,
      });
      assert.equal(isToolError(page), false);
      if (isToolError(page)) {
        return;
      }
      const row = page.activities[0];
      assert.ok(row);
      const before = row.before as Record<string, unknown>;
      const after = row.after as Record<string, unknown>;
      assert.equal("title" in before, true);
      assert.equal("payload" in before, true);
      assert.equal("id" in before, false);
      assert.equal("type" in before, false);
      assert.equal(before.title, "diary note");
      assert.equal(after.title, "diary note two");
      assert.equal(row.schema_version, ACTIVITY_SCHEMA_VERSION);

      const undone = await undoGraphActivity(
        pool,
        { id: updated.activity_id, base_updated_at: updated.node.updated_at },
        DESTRUCTIVE,
      );
      assert.equal(isToolError(undone), false);
      if (isToolError(undone)) {
        return;
      }
    });

    await t.test("undo refuses an unknown snapshot schema_version", async () => {
      const extra = await upsertGraphNode(pool, {
        type: "note",
        title: "future snapshot",
      });
      assert.equal(isToolError(extra), false);
      if (isToolError(extra)) {
        return;
      }
      await pool.query(`UPDATE activity SET schema_version = 2 WHERE id = $1`, [extra.activity_id]);
      const refused = await undoGraphActivity(
        pool,
        { id: extra.activity_id, base_updated_at: extra.node.updated_at },
        DESTRUCTIVE,
      );
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) {
        return;
      }
      assert.match(refused.error, /schema_version 2/);
    });
  } finally {
    await pool.end();
  }
});
