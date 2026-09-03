import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { applyJob } from "./leases.js";

const databaseUrl = process.env.DATABASE_URL;

async function poolsForSchema(schema: string): Promise<{ a: Pool; b: Pool }> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const options = { options: `-c search_path=${schema},public` };
  const a = createPool(databaseUrl!, options);
  await migrate(a);
  await seedSystemOntology(a);
  const b = createPool(databaseUrl!, options);
  return { a, b };
}

test("two connections racing one job leave one holder", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const { a, b } = await poolsForSchema("job_lease_race");
  try {
    const [left, right] = await Promise.all([
      applyJob(a, { action: "claim", name: "dream" }, { name: "alpha", actor_label: "Alpha" }),
      applyJob(b, { action: "claim", name: "dream" }, { name: "beta", actor_label: "Beta" }),
    ]);
    const wins = [left, right].filter((row) => !isToolError(row));
    const losses = [left, right].filter((row) => isToolError(row));
    assert.equal(wins.length, 1);
    assert.equal(losses.length, 1);
    if (isToolError(losses[0])) {
      assert.equal(losses[0].error, "Held");
    }
  } finally {
    await a.end();
    await b.end();
  }
});
