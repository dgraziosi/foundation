import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  isToolError,
  UPSERT_INCOMPLETE_SUGGESTION,
  UPSERT_TOP_LEVEL_DUE_ERROR,
  UPSERT_TOP_LEVEL_DUE_SUGGESTION,
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
  "upsert refuses silent due, names type and title, and skips no-op history",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("upsert_silent");
    try {
      const created = await upsertGraphNode(pool, {
        type: "task",
        title: "Fixture silent task",
        data: { due: "2026-08-01" },
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) {
        return;
      }
      const before = await listGraphActivity(pool, { target: created.node.id, limit: 50 });
      assert.equal(isToolError(before), false);
      if (isToolError(before)) {
        return;
      }
      const startCount = before.count;

      await t.test("missing title on a receipt-only update names the four fields", async () => {
        const missing = await upsertGraphNode(pool, {
          id: created.node.id,
          base_updated_at: created.node.updated_at,
          data: { receipt: { system: "gmail", id: "msg-fixture-1", kind: "drafted" } },
        } as Parameters<typeof upsertGraphNode>[1]);
        assert.equal(isToolError(missing), true);
        if (!isToolError(missing)) {
          return;
        }
        assert.equal(missing.error, "Pass type and title for one node, or nodes (1 to 20) for several");
        assert.equal(missing.suggestion, UPSERT_INCOMPLETE_SUGGESTION);
      });

      await t.test("top-level due refuses and writes nothing", async () => {
        const refused = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "task",
          title: "Fixture silent task",
          base_updated_at: created.node.updated_at,
          due: "2026-08-27",
        } as Parameters<typeof upsertGraphNode>[1]);
        assert.equal(isToolError(refused), true);
        if (!isToolError(refused)) {
          return;
        }
        assert.equal(refused.error, UPSERT_TOP_LEVEL_DUE_ERROR);
        assert.equal(refused.suggestion, UPSERT_TOP_LEVEL_DUE_SUGGESTION);

        const batch = await upsertGraphNode(pool, {
          nodes: [
            {
              id: created.node.id,
              type: "task",
              title: "Fixture silent task",
              base_updated_at: created.node.updated_at,
              due: "2026-08-27",
            },
          ],
        } as unknown as Parameters<typeof upsertGraphNode>[1]);
        assert.equal(isToolError(batch), true);
        if (!isToolError(batch)) {
          return;
        }
        assert.equal(batch.error, `nodes[0]: ${UPSERT_TOP_LEVEL_DUE_ERROR}`);

        const afterRefuse = await listGraphActivity(pool, { target: created.node.id, limit: 50 });
        assert.equal(isToolError(afterRefuse), false);
        if (isToolError(afterRefuse)) {
          return;
        }
        assert.equal(afterRefuse.count, startCount);
      });

      await t.test("no-op update omits activity_id and keeps updated_at", async () => {
        const noop = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "task",
          title: "Fixture silent task",
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(noop), false);
        if (isToolError(noop)) {
          return;
        }
        assert.equal(noop.activity_id, undefined);
        assert.equal(noop.node.updated_at, created.node.updated_at);
        const afterNoop = await listGraphActivity(pool, { target: created.node.id, limit: 50 });
        assert.equal(isToolError(afterNoop), false);
        if (isToolError(afterNoop)) {
          return;
        }
        assert.equal(afterNoop.count, startCount);
      });

      await t.test("data.due write returns activity_id and a new row", async () => {
        const written = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "task",
          title: "Fixture silent task",
          base_updated_at: created.node.updated_at,
          data: { due: "2026-08-27" },
        });
        assert.equal(isToolError(written), false);
        if (isToolError(written)) {
          return;
        }
        assert.equal(typeof written.activity_id, "string");
        assert.equal(written.node.data.due, "2026-08-27");
        const afterWrite = await listGraphActivity(pool, { target: created.node.id, limit: 50 });
        assert.equal(isToolError(afterWrite), false);
        if (isToolError(afterWrite)) {
          return;
        }
        assert.equal(afterWrite.count, startCount + 1);
      });
    } finally {
      await pool.end();
    }
  },
);
