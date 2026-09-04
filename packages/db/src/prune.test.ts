import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool } from "./client.js";
import { insertActivity, listActivity } from "./activity.js";
import { migrate } from "./migrate.js";
import { pruneActivity } from "./prune.js";
import { updateVaultSettings } from "./settings.js";

const databaseUrl = process.env.DATABASE_URL;

async function poolForSchema(schema: string) {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  return createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
}

test("pruneActivity deletes only rows older than the settings row", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("activity_prune_settings");
  try {
    await migrate(pool);
    const now = new Date("2026-09-03T12:00:00.000Z");
    const oldId = (
      await insertActivity(pool, {
        action: "create",
        target_kind: "node",
        target_id: "11111111-1111-4111-8111-111111111111",
        after: { id: "11111111-1111-4111-8111-111111111111" },
        reversible: false,
      })
    ).id;
    const recentId = (
      await insertActivity(pool, {
        action: "update",
        target_kind: "node",
        target_id: "11111111-1111-4111-8111-111111111111",
        before: { title: "a" },
        after: { title: "b" },
      })
    ).id;
    await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [
      oldId,
      new Date("2026-08-01T12:00:00.000Z"),
    ]);
    await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [
      recentId,
      new Date("2026-09-02T12:00:00.000Z"),
    ]);

    await updateVaultSettings(pool, { activity_retention_days: 7 });
    const first = await pruneActivity(pool, { now });
    assert.equal(first.activity_retention_days, 7);
    assert.equal(first.deleted, 1);
    const afterShort = await listActivity(pool, { target: "11111111-1111-4111-8111-111111111111" });
    assert.equal(afterShort.count, 1);
    assert.equal(afterShort.activities[0]?.id, recentId);
    assert.equal(afterShort.activities[0]?.schema_version, 1);
    assert.equal(afterShort.activities[0]?.undo_token !== null, true);

    await updateVaultSettings(pool, { activity_retention_days: 365 });
    const second = await pruneActivity(pool, { now });
    assert.equal(second.activity_retention_days, 365);
    assert.equal(second.deleted, 0);
    const afterWide = await listActivity(pool, { target: "11111111-1111-4111-8111-111111111111" });
    assert.equal(afterWide.count, 1);
    assert.equal(afterWide.activities[0]?.id, recentId);
  } finally {
    await pool.end();
  }
});

test("pruneActivity is idempotent and keeps the boundary row", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("activity_prune_boundary");
  try {
    await migrate(pool);
    const now = new Date("2026-09-03T12:00:00.000Z");
    await updateVaultSettings(pool, { activity_retention_days: 2 });
    const edgeId = (
      await insertActivity(pool, {
        action: "create",
        target_kind: "node",
        target_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reversible: false,
      })
    ).id;
    const olderId = (
      await insertActivity(pool, {
        action: "create",
        target_kind: "node",
        target_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        reversible: false,
      })
    ).id;
    await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [
      edgeId,
      new Date("2026-09-01T12:00:00.000Z"),
    ]);
    await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [
      olderId,
      new Date("2026-09-01T11:59:59.000Z"),
    ]);
    const first = await pruneActivity(pool, { now });
    assert.equal(first.deleted, 1);
    const again = await pruneActivity(pool, { now });
    assert.equal(again.deleted, 0);
    const page = await listActivity(pool);
    assert.equal(page.count, 1);
    assert.equal(page.activities[0]?.id, edgeId);
  } finally {
    await pool.end();
  }
});
