import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { JOB_HELD_ERROR, JOB_TOKEN_STALE_ERROR, isToolError } from "@foundation/schema";
import { applyJob } from "./leases.js";

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

test("job claim, conflict, last-run, release, and re-claim", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("job_lease_domain");
  const keeper = { name: "vault-keeper", actor_label: "Vault Keeper" };
  const chief = { name: "chief", actor_label: "Chief of Staff" };
  try {
    const claimed = await applyJob(pool, { action: "claim", name: "dream" }, keeper);
    assert.equal(isToolError(claimed), false);
    if (isToolError(claimed)) {
      return;
    }
    assert.equal(claimed.job.held, true);
    assert.equal(claimed.job.holder?.name, "vault-keeper");
    assert.ok(claimed.token);

    const conflict = await applyJob(pool, { action: "claim", name: "dream" }, chief);
    assert.equal(isToolError(conflict), true);
    if (isToolError(conflict)) {
      assert.equal(conflict.error, JOB_HELD_ERROR);
      assert.match(conflict.suggestion ?? "", /Vault Keeper holds dream/);
    }

    const sameKey = await applyJob(pool, { action: "claim", name: "dream" }, keeper);
    assert.equal(isToolError(sameKey), true);

    const beat = await applyJob(
      pool,
      { action: "claim", name: "dream", token: claimed.token },
      keeper,
    );
    assert.equal(isToolError(beat), false);
    if (!isToolError(beat)) {
      assert.equal(beat.token, claimed.token);
    }

    const finished = await applyJob(
      pool,
      { action: "finish", name: "dream", token: claimed.token },
      keeper,
    );
    assert.equal(isToolError(finished), false);
    if (!isToolError(finished)) {
      assert.equal(finished.job.held, false);
      assert.equal(finished.job.last_run?.holder.name, "vault-keeper");
      assert.equal(finished.token, undefined);
    }

    const read = await applyJob(pool, { action: "read", name: "dream" }, chief);
    assert.equal(isToolError(read), false);
    if (!isToolError(read)) {
      assert.equal(read.job.last_run?.holder.label, "Vault Keeper");
      assert.equal(read.token, undefined);
    }

    const again = await applyJob(pool, { action: "claim", name: "dream" }, chief);
    assert.equal(isToolError(again), false);
    if (isToolError(again)) {
      return;
    }
    const released = await applyJob(
      pool,
      { action: "release", name: "dream", token: again.token },
      chief,
    );
    assert.equal(isToolError(released), false);
    if (!isToolError(released)) {
      assert.equal(released.job.held, false);
      assert.equal(released.job.last_run?.holder.name, "vault-keeper");
    }

    const stale = await applyJob(
      pool,
      { action: "finish", name: "dream", token: claimed.token },
      keeper,
    );
    assert.equal(isToolError(stale), true);
    if (isToolError(stale)) {
      assert.equal(stale.error, JOB_TOKEN_STALE_ERROR);
    }
  } finally {
    await pool.end();
  }
});

test("read of an unknown name is an open row", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("job_lease_open");
  try {
    const read = await applyJob(
      pool,
      { action: "read", name: "vault-health" },
      { name: "root", actor_label: "root" },
    );
    assert.equal(isToolError(read), false);
    if (!isToolError(read)) {
      assert.equal(read.job.held, false);
      assert.equal(read.job.last_run, null);
    }
  } finally {
    await pool.end();
  }
});
