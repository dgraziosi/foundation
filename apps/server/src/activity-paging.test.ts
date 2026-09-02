import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  LIST_CURSOR_INVALID_SUGGESTION,
  ListActivityInputSchema,
  isToolError,
} from "@foundation/schema";
import { listGraphActivity, upsertGraphNode } from "./graph.js";

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

test(
  "list_activity pages with a keyset cursor and an honest count",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("activity_paging");
    try {
      for (let i = 1; i <= 25; i += 1) {
        const created = await upsertGraphNode(pool, {
          type: "note",
          title: `Activity paging ${String(i).padStart(2, "0")}`,
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) {
          return;
        }
      }

      await t.test("default create list is 20 of 25, then cursor page two", async () => {
        const first = await listGraphActivity(pool, { action: "create", limit: 20 });
        assert.equal(isToolError(first), false);
        if (isToolError(first)) {
          return;
        }
        assert.equal(first.activities.length, 20);
        assert.equal(first.count, 25);
        assert.equal(typeof first.next, "string");

        const second = await listGraphActivity(pool, {
          action: "create",
          limit: 20,
          cursor: first.next,
        });
        assert.equal(isToolError(second), false);
        if (isToolError(second)) {
          return;
        }
        assert.equal(second.activities.length, 5);
        assert.equal(second.count, 25);
        assert.equal(second.next, undefined);

        const firstIds = new Set(first.activities.map((row) => row.id));
        assert.equal(second.activities.every((row) => !firstIds.has(row.id)), true);
      });

      await t.test("since stays a window", async () => {
        const future = await listGraphActivity(pool, {
          action: "create",
          since: "2099-01-01T00:00:00.000Z",
        });
        assert.equal(isToolError(future), false);
        if (isToolError(future)) {
          return;
        }
        assert.equal(future.activities.length, 0);
        assert.equal(future.count, 0);

        const windowed = await listGraphActivity(pool, {
          action: "create",
          since: "2020-01-01T00:00:00.000Z",
          limit: 20,
        });
        assert.equal(isToolError(windowed), false);
        if (isToolError(windowed)) {
          return;
        }
        assert.equal(windowed.count, 25);
        assert.equal(windowed.activities.length, 20);
      });

      await t.test("offset is not a page", async () => {
        const parsed = ListActivityInputSchema.parse({
          action: "create",
          offset: 20,
          limit: 20,
        });
        assert.equal("offset" in parsed, false);
        const first = await listGraphActivity(pool, { action: "create", limit: 20 });
        const pretended = await listGraphActivity(pool, parsed);
        assert.equal(isToolError(first), false);
        assert.equal(isToolError(pretended), false);
        if (isToolError(first) || isToolError(pretended)) {
          return;
        }
        assert.deepEqual(
          pretended.activities.map((row) => row.id),
          first.activities.map((row) => row.id),
        );
      });

      await t.test("junk cursor refuses", async () => {
        const junk = await listGraphActivity(pool, { action: "create", cursor: "not-a-cursor" });
        assert.equal(isToolError(junk), true);
        if (!isToolError(junk)) {
          return;
        }
        assert.equal(junk.suggestion, LIST_CURSOR_INVALID_SUGGESTION);
      });
    } finally {
      await pool.end();
    }
  },
);
