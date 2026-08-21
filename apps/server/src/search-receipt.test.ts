import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  RECEIPT_HIT_SUGGESTION,
  RECEIPT_MISS_SUGGESTION,
  isToolError,
} from "@foundation/schema";
import { getGraphNode, searchGraphNodes, upsertGraphNode } from "./graph.js";

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
  "receipt uniqueness, search, get, clear, and pairing",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_filters_receipt");
    try {
      await t.test("sent receipt writes, get shows it, search finds it, twins refuse", async () => {
        const task = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway sent receipt task",
          data: { receipt: { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" } },
        });
        assert.equal(isToolError(task), false);
        if (isToolError(task)) {
          return;
        }
        assert.deepEqual(task.node.data.receipt, {
          system: "gmail",
          id: "msg-fixture-sent-1",
          kind: "sent",
        });

        const got = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.deepEqual(got.node.data.receipt, {
          system: "gmail",
          id: "msg-fixture-sent-1",
          kind: "sent",
        });

        const hit = await searchGraphNodes(pool, {
          receipt: { system: "gmail", id: "msg-fixture-sent-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, task.node.id);
        assert.equal(hit.suggestion, RECEIPT_HIT_SUGGESTION);

        const twin = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway twin receipt task",
          data: { receipt: { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" } },
        });
        assert.equal(isToolError(twin), true);
        if (!isToolError(twin)) {
          return;
        }
        assert.match(twin.error, /gmail:msg-fixture-sent-1/);
        assert.match(twin.error, new RegExp(task.node.id));
        assert.match(twin.suggestion ?? "", /search with receipt/i);
      });

      await t.test("cleared receipt is independent of origin on the same node", async () => {
        const task = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway calendar receipt task",
          data: {
            origin: { system: "calendar", id: "evt-fixture-1" },
            receipt: { system: "calendar", id: "evt-fixture-1", kind: "cleared" },
          },
        });
        assert.equal(isToolError(task), false);
        if (isToolError(task)) {
          return;
        }
        assert.deepEqual(task.node.data.origin, { system: "calendar", id: "evt-fixture-1" });
        assert.deepEqual(task.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-1",
          kind: "cleared",
        });

        const byOrigin = await searchGraphNodes(pool, {
          origin: { system: "calendar", id: "evt-fixture-1" },
        });
        const byReceipt = await searchGraphNodes(pool, {
          receipt: { system: "calendar", id: "evt-fixture-1" },
        });
        assert.equal(isToolError(byOrigin), false);
        assert.equal(isToolError(byReceipt), false);
        if (isToolError(byOrigin) || isToolError(byReceipt)) {
          return;
        }
        assert.ok(byOrigin.nodes.some((node) => node.id === task.node.id));
        assert.ok(byReceipt.nodes.some((node) => node.id === task.node.id));
      });

      await t.test("search receipt misses, origin search does not see a receipt-only node", async () => {
        const miss = await searchGraphNodes(pool, {
          receipt: { system: "gmail", id: "no-such-receipt" },
        });
        assert.equal(isToolError(miss), false);
        if (isToolError(miss)) {
          return;
        }
        assert.deepEqual(miss.nodes, []);
        assert.equal(miss.suggestion, RECEIPT_MISS_SUGGESTION);

        const originMiss = await searchGraphNodes(pool, {
          origin: { system: "gmail", id: "msg-fixture-sent-1" },
        });
        assert.equal(isToolError(originMiss), false);
        if (!isToolError(originMiss)) {
          assert.deepEqual(originMiss.nodes, []);
        }
      });

      await t.test("incomplete, unknown, and unpaired receipts refuse", async () => {
        const incomplete = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway incomplete receipt",
          data: { receipt: { system: "gmail", id: "msg-fixture-sent-1" } },
        });
        assert.equal(isToolError(incomplete), true);
        if (isToolError(incomplete)) {
          assert.match(incomplete.error, /requires system, id, and kind/);
        }

        const unknown = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway github receipt",
          data: { receipt: { system: "github", id: "x", kind: "sent" } },
        });
        assert.equal(isToolError(unknown), true);
        if (isToolError(unknown)) {
          assert.match(unknown.error, /Unknown receipt.system "github"/);
        }

        const unpaired = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway unpaired receipt",
          data: { receipt: { system: "calendar", id: "evt-fixture-1", kind: "sent" } },
        });
        assert.equal(isToolError(unpaired), true);
        if (isToolError(unpaired)) {
          assert.match(unpaired.error, /does not pair/);
        }
      });

      await t.test("receipt null clears; merge keeps origin; padded id trims", async () => {
        const created = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway clear receipt task",
          data: {
            origin: { system: "gmail", id: "msg-fixture-1" },
            receipt: { system: "gmail", id: "  msg-fixture-sent-clear  ", kind: "sent" },
          },
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) {
          return;
        }
        assert.deepEqual(created.node.data.receipt, {
          system: "gmail",
          id: "msg-fixture-sent-clear",
          kind: "sent",
        });

        const cleared = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "task",
          title: "Throwaway clear receipt task",
          data: { receipt: null },
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(cleared), false);
        if (isToolError(cleared)) {
          return;
        }
        assert.equal(cleared.node.data.receipt, undefined);
        assert.deepEqual(cleared.node.data.origin, { system: "gmail", id: "msg-fixture-1" });

        const afterClear = await searchGraphNodes(pool, {
          receipt: { system: "gmail", id: "msg-fixture-sent-clear" },
        });
        assert.equal(isToolError(afterClear), false);
        if (!isToolError(afterClear)) {
          assert.deepEqual(afterClear.nodes, []);
          assert.equal(afterClear.suggestion, RECEIPT_MISS_SUGGESTION);
        }

        const got = await getGraphNode(pool, created.node.id);
        assert.equal(isToolError(got), false);
        if (!isToolError(got)) {
          assert.equal(got.node.data.receipt, undefined);
          assert.deepEqual(got.node.data.origin, { system: "gmail", id: "msg-fixture-1" });
        }
      });
    } finally {
      await pool.end();
    }
  },
);
