import assert from "node:assert/strict";
import { test } from "node:test";
import { hashJobToken, mintJobToken } from "@foundation/schema";
import { createPool } from "./client.js";
import {
  casClaimJobLease,
  casFinishJobLease,
  casHeartbeatJobLease,
  casReleaseJobLease,
  getJobLeaseByName,
} from "./leases.js";
import { migrate } from "./migrate.js";

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

test("job_leases table exists after migrate", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("job_leases_migrate");
  try {
    await migrate(pool);
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'job_leases'
        ORDER BY column_name`,
    );
    assert.deepEqual(
      rows.map((row) => row.column_name),
      [
        "claimed_at",
        "created_at",
        "expires_at",
        "holder_label",
        "holder_name",
        "last_run_at",
        "last_run_holder_label",
        "last_run_holder_name",
        "name",
        "token_sha256",
        "updated_at",
      ],
    );
  } finally {
    await pool.end();
  }
});

test("claim, conflicting claim, finish, and re-claim", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("job_leases_claim");
  try {
    await migrate(pool);
    const first = mintJobToken();
    const taken = await casClaimJobLease(pool, {
      name: "dream",
      holderName: "vault-keeper",
      holderLabel: "Vault Keeper",
      tokenSha256: hashJobToken(first),
      ttlSeconds: 900,
    });
    assert.equal(taken?.holder_name, "vault-keeper");
    assert.equal(taken?.token_sha256, hashJobToken(first));

    const second = mintJobToken();
    const blocked = await casClaimJobLease(pool, {
      name: "dream",
      holderName: "chief",
      holderLabel: "Chief of Staff",
      tokenSha256: hashJobToken(second),
      ttlSeconds: 900,
    });
    assert.equal(blocked, null);
    const live = await getJobLeaseByName(pool, "dream");
    assert.equal(live?.holder_name, "vault-keeper");

    const finished = await casFinishJobLease(pool, {
      name: "dream",
      tokenSha256: hashJobToken(first),
    });
    assert.equal(finished?.holder_name, null);
    assert.equal(finished?.last_run_holder_name, "vault-keeper");
    assert.ok(finished?.last_run_at);

    const third = mintJobToken();
    const again = await casClaimJobLease(pool, {
      name: "dream",
      holderName: "chief",
      holderLabel: "Chief of Staff",
      tokenSha256: hashJobToken(third),
      ttlSeconds: 900,
    });
    assert.equal(again?.holder_name, "chief");
    assert.equal(again?.last_run_holder_name, "vault-keeper");
  } finally {
    await pool.end();
  }
});

test("release leaves last_run alone; expiry can be claimed", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("job_leases_release");
  try {
    await migrate(pool);
    const token = mintJobToken();
    await casClaimJobLease(pool, {
      name: "vault-health",
      holderName: "root",
      holderLabel: "root",
      tokenSha256: hashJobToken(token),
      ttlSeconds: 900,
    });
    await casFinishJobLease(pool, { name: "vault-health", tokenSha256: hashJobToken(token) });

    const again = mintJobToken();
    await casClaimJobLease(pool, {
      name: "vault-health",
      holderName: "root",
      holderLabel: "root",
      tokenSha256: hashJobToken(again),
      ttlSeconds: 900,
    });
    const released = await casReleaseJobLease(pool, {
      name: "vault-health",
      tokenSha256: hashJobToken(again),
    });
    assert.equal(released?.holder_name, null);
    assert.equal(released?.last_run_holder_name, "root");

    const expired = mintJobToken();
    await casClaimJobLease(pool, {
      name: "vault-health",
      holderName: "root",
      holderLabel: "root",
      tokenSha256: hashJobToken(expired),
      ttlSeconds: 900,
    });
    await pool.query(
      `UPDATE job_leases SET expires_at = date_trunc('milliseconds', clock_timestamp()) - interval '1 second'
        WHERE name = 'vault-health'`,
    );
    const takeover = mintJobToken();
    const won = await casClaimJobLease(pool, {
      name: "vault-health",
      holderName: "chief",
      holderLabel: "Chief of Staff",
      tokenSha256: hashJobToken(takeover),
      ttlSeconds: 60,
    });
    assert.equal(won?.holder_name, "chief");
    assert.equal(won?.last_run_holder_name, "root");
  } finally {
    await pool.end();
  }
});

test("heartbeat extends a live token and refuses a stranger", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("job_leases_keep");
  try {
    await migrate(pool);
    const token = mintJobToken();
    const claimed = await casClaimJobLease(pool, {
      name: "graph-hygiene",
      holderName: "vault-keeper",
      holderLabel: "Vault Keeper",
      tokenSha256: hashJobToken(token),
      ttlSeconds: 60,
    });
    const kept = await casHeartbeatJobLease(pool, {
      name: "graph-hygiene",
      tokenSha256: hashJobToken(token),
      ttlSeconds: 900,
    });
    assert.ok(kept?.expires_at);
    assert.notEqual(kept?.expires_at, claimed?.expires_at);
    const miss = await casHeartbeatJobLease(pool, {
      name: "graph-hygiene",
      tokenSha256: hashJobToken(mintJobToken()),
      ttlSeconds: 900,
    });
    assert.equal(miss, null);
  } finally {
    await pool.end();
  }
});
