import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_VAULT_SETTINGS, DUE_TIMEZONE } from "@foundation/schema";
import { createPool } from "./client.js";
import { migrate } from "./migrate.js";
import { getVaultSettings, updateVaultSettings } from "./settings.js";

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

test("migrate seeds one vault_settings row with America/New_York", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("vault_settings_migrate");
  try {
    await migrate(pool);
    const { rows } = await pool.query<{ n: string; timezone: string }>(
      `SELECT count(*)::text AS n, min(timezone) AS timezone FROM vault_settings`,
    );
    assert.equal(rows[0]?.n, "1");
    assert.equal(rows[0]?.timezone, DUE_TIMEZONE);
    const settings = await getVaultSettings(pool);
    assert.deepEqual(settings, DEFAULT_VAULT_SETTINGS);
  } finally {
    await pool.end();
  }
});

test("updateVaultSettings changes timezone and working-set caps", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("vault_settings_update");
  try {
    await migrate(pool);
    const next = await updateVaultSettings(pool, {
      timezone: "Pacific/Auckland",
      working_set_limit_default: 2,
      working_set_due_within_days: 7,
    });
    assert.equal(next.timezone, "Pacific/Auckland");
    assert.equal(next.working_set_limit_default, 2);
    assert.equal(next.working_set_due_within_days, 7);
    assert.equal(next.search_limit_default, DEFAULT_VAULT_SETTINGS.search_limit_default);
    const again = await getVaultSettings(pool);
    assert.equal(again.timezone, "Pacific/Auckland");
    assert.equal(again.working_set_limit_default, 2);
  } finally {
    await pool.end();
  }
});
