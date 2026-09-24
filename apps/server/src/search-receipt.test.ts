import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, insertNode, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  DEFAULT_PAYLOAD,
  RECEIPT_HIT_SUGGESTION,
  RECEIPT_MISS_SUGGESTION,
  isToolError,
} from "@foundation/schema";
import { deleteGraphNode, getGraphNode, searchGraphNodes, upsertGraphNode } from "./graph.js";
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

      await t.test("cleared receipt is independent of url on the same node", async () => {
        const task = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway calendar receipt task",
          url: { system: "calendar", id: "evt-fixture-1" },
          data: {
            receipt: { system: "calendar", id: "evt-fixture-1", kind: "cleared" },
          },
        });
        assert.equal(isToolError(task), false);
        if (isToolError(task)) {
          return;
        }
        assert.deepEqual(task.node.metadata.url, { system: "calendar", id: "evt-fixture-1" });
        assert.deepEqual(task.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-1",
          kind: "cleared",
        });

        const byUrl = await searchGraphNodes(pool, {
          url: { system: "calendar", id: "evt-fixture-1" },
        });
        const byReceipt = await searchGraphNodes(pool, {
          receipt: { system: "calendar", id: "evt-fixture-1" },
        });
        assert.equal(isToolError(byUrl), false);
        assert.equal(isToolError(byReceipt), false);
        if (isToolError(byUrl) || isToolError(byReceipt)) {
          return;
        }
        assert.ok(byUrl.nodes.some((node) => node.id === task.node.id));
        assert.ok(byReceipt.nodes.some((node) => node.id === task.node.id));
      });

      await t.test("search receipt misses, url search does not see a receipt-only node", async () => {
        const miss = await searchGraphNodes(pool, {
          receipt: { system: "gmail", id: "no-such-receipt" },
        });
        assert.equal(isToolError(miss), false);
        if (isToolError(miss)) {
          return;
        }
        assert.deepEqual(miss.nodes, []);
        assert.equal(miss.suggestion, RECEIPT_MISS_SUGGESTION);

        const urlMiss = await searchGraphNodes(pool, {
          url: { system: "gmail", id: "msg-fixture-sent-1" },
        });
        assert.equal(isToolError(urlMiss), false);
        if (!isToolError(urlMiss)) {
          assert.deepEqual(urlMiss.nodes, []);
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

      await t.test("update that collides on a live receipt returns the structured ToolError", async () => {
        const held = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway held receipt task",
          data: { receipt: { system: "gmail", id: "msg-fixture-sent-update", kind: "sent" } },
        });
        assert.equal(isToolError(held), false);
        if (isToolError(held)) {
          return;
        }

        const other = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway other receipt task",
        });
        assert.equal(isToolError(other), false);
        if (isToolError(other)) {
          return;
        }

        const collide = await upsertGraphNode(pool, {
          id: other.node.id,
          type: "task",
          title: "Throwaway other receipt task",
          data: { receipt: { system: "gmail", id: "msg-fixture-sent-update", kind: "sent" } },
          base_updated_at: other.node.updated_at,
        });
        assert.equal(isToolError(collide), true);
        if (!isToolError(collide)) {
          return;
        }
        assert.match(collide.error, /gmail:msg-fixture-sent-update/);
        assert.match(collide.error, new RegExp(held.node.id));
        assert.match(collide.suggestion ?? "", /search with receipt/i);

        const still = await getGraphNode(pool, other.node.id);
        assert.equal(isToolError(still), false);
        if (!isToolError(still)) {
          assert.equal(still.node.data.receipt, undefined);
        }
      });

      await t.test("same record may hold url then booked, moved, and cleared", async () => {
        const task = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway booked calendar task",
          url: { system: "calendar", id: "evt-fixture-booked-1" },
          data: {
            receipt: { system: "calendar", id: "evt-fixture-booked-1", kind: "booked" },
          },
        });
        assert.equal(isToolError(task), false);
        if (isToolError(task)) {
          return;
        }
        assert.deepEqual(task.node.metadata.url, { system: "calendar", id: "evt-fixture-booked-1" });
        assert.deepEqual(task.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-booked-1",
          kind: "booked",
        });

        const moved = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "task",
          title: "Throwaway booked calendar task",
          data: {
            receipt: { system: "calendar", id: "evt-fixture-booked-1", kind: "moved" },
          },
          base_updated_at: task.node.updated_at,
        });
        assert.equal(isToolError(moved), false);
        if (isToolError(moved)) {
          return;
        }
        assert.deepEqual(moved.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-booked-1",
          kind: "moved",
        });

        const cleared = await upsertGraphNode(pool, {
          id: moved.node.id,
          type: "task",
          title: "Throwaway booked calendar task",
          data: {
            receipt: { system: "calendar", id: "evt-fixture-booked-1", kind: "cleared" },
          },
          base_updated_at: moved.node.updated_at,
        });
        assert.equal(isToolError(cleared), false);
        if (isToolError(cleared)) {
          return;
        }
        assert.deepEqual(cleared.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-booked-1",
          kind: "cleared",
        });
        assert.deepEqual(cleared.node.metadata.url, { system: "calendar", id: "evt-fixture-booked-1" });
      });

      await t.test("deleted hold frees receipt so host can take url then cleared", async () => {
        const hold = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway hold calendar task",
          url: { system: "calendar", id: "evt-fixture-hold-1" },
          data: {
            receipt: { system: "calendar", id: "evt-fixture-hold-1", kind: "booked" },
          },
        });
        assert.equal(isToolError(hold), false);
        if (isToolError(hold)) {
          return;
        }

        const deleted = await deleteGraphNode(
          pool,
          { id: hold.node.id, base_updated_at: hold.node.updated_at },
          DESTRUCTIVE,
        );
        assert.equal(isToolError(deleted), false);

        const host = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway host calendar task",
          url: { system: "calendar", id: "evt-fixture-hold-1" },
          data: {
            receipt: { system: "calendar", id: "evt-fixture-hold-1", kind: "cleared" },
          },
        });
        assert.equal(isToolError(host), false);
        if (isToolError(host)) {
          return;
        }
        assert.deepEqual(host.node.metadata.url, { system: "calendar", id: "evt-fixture-hold-1" });
        assert.deepEqual(host.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-hold-1",
          kind: "cleared",
        });

        const byReceipt = await searchGraphNodes(pool, {
          receipt: { system: "calendar", id: "evt-fixture-hold-1" },
        });
        assert.equal(isToolError(byReceipt), false);
        if (!isToolError(byReceipt)) {
          assert.equal(byReceipt.nodes.length, 1);
          assert.equal(byReceipt.nodes[0]?.id, host.node.id);
        }
      });

      await t.test("live hold receipt and host url for the same id refuse", async () => {
        const hold = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway live hold receipt",
          data: {
            receipt: { system: "calendar", id: "evt-fixture-split-1", kind: "booked" },
          },
        });
        assert.equal(isToolError(hold), false);
        if (isToolError(hold)) {
          return;
        }

        const hostUrl = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway live host url",
          url: { system: "calendar", id: "evt-fixture-split-1" },
        });
        assert.equal(isToolError(hostUrl), true);
        if (isToolError(hostUrl)) {
          assert.match(hostUrl.error, /belongs with live receipt owner/);
          assert.match(hostUrl.error, new RegExp(hold.node.id));
          assert.match(hostUrl.suggestion ?? "", /do not split url and receipt/i);
        }

        const host = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway live host url",
        });
        assert.equal(isToolError(host), false);
        if (isToolError(host)) {
          return;
        }
        const holdHasUrl = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway other url owner",
          url: { system: "calendar", id: "evt-fixture-split-2" },
        });
        assert.equal(isToolError(holdHasUrl), false);
        if (isToolError(holdHasUrl)) {
          return;
        }
        const receiptOnOther = await upsertGraphNode(pool, {
          id: host.node.id,
          type: "task",
          title: "Throwaway live host url",
          data: {
            receipt: { system: "calendar", id: "evt-fixture-split-2", kind: "cleared" },
          },
          base_updated_at: host.node.updated_at,
        });
        assert.equal(isToolError(receiptOnOther), true);
        if (isToolError(receiptOnOther)) {
          assert.match(receiptOnOther.error, /belongs with live url owner/);
          assert.match(receiptOnOther.error, new RegExp(holdHasUrl.node.id));
        }

        const released = await upsertGraphNode(pool, {
          id: hold.node.id,
          type: "task",
          title: "Throwaway live hold receipt",
          data: { receipt: null },
          base_updated_at: hold.node.updated_at,
        });
        assert.equal(isToolError(released), false);
        if (isToolError(released)) {
          return;
        }
        const hostTakes = await upsertGraphNode(pool, {
          id: host.node.id,
          type: "task",
          title: "Throwaway live host url",
          url: { system: "calendar", id: "evt-fixture-split-1" },
          data: {
            receipt: { system: "calendar", id: "evt-fixture-split-1", kind: "cleared" },
          },
          base_updated_at: host.node.updated_at,
        });
        assert.equal(isToolError(hostTakes), false);
        if (!isToolError(hostTakes)) {
          assert.deepEqual(hostTakes.node.data.receipt, {
            system: "calendar",
            id: "evt-fixture-split-1",
            kind: "cleared",
          });
        }
      });

      await t.test("leftover split still allows title, due, status, and payload updates", async () => {
        const hold = await insertNode(pool, {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          type: "task",
          title: "Throwaway leftover receipt",
          status: "active",
          payload: DEFAULT_PAYLOAD,
          data: {
            receipt: { system: "calendar", id: "evt-fixture-split-unrelated-1", kind: "booked" },
          },
          metadata: {},
        });
        const host = await insertNode(pool, {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          type: "task",
          title: "Throwaway leftover url",
          status: "active",
          payload: DEFAULT_PAYLOAD,
          data: {},
          metadata: { url: { system: "calendar", id: "evt-fixture-split-unrelated-1" } },
        });

        const titled = await upsertGraphNode(pool, {
          id: hold.id,
          type: "task",
          title: "Throwaway leftover receipt renamed",
          base_updated_at: hold.updated_at,
        });
        assert.equal(isToolError(titled), false);
        if (isToolError(titled)) {
          return;
        }
        assert.equal(titled.node.title, "Throwaway leftover receipt renamed");
        assert.deepEqual(titled.node.data.receipt, {
          system: "calendar",
          id: "evt-fixture-split-unrelated-1",
          kind: "booked",
        });

        const dueOnHost = await upsertGraphNode(pool, {
          id: host.id,
          type: "task",
          title: host.title,
          data: { due: "2026-09-24" },
          base_updated_at: host.updated_at,
        });
        assert.equal(isToolError(dueOnHost), false);
        if (isToolError(dueOnHost)) {
          return;
        }
        assert.equal(dueOnHost.node.data.due, "2026-09-24");
        assert.deepEqual(dueOnHost.node.metadata.url, {
          system: "calendar",
          id: "evt-fixture-split-unrelated-1",
        });

        const statusOnHold = await upsertGraphNode(pool, {
          id: titled.node.id,
          type: "task",
          title: titled.node.title,
          status: "completed",
          base_updated_at: titled.node.updated_at,
        });
        assert.equal(isToolError(statusOnHold), false);
        if (isToolError(statusOnHold)) {
          return;
        }
        assert.equal(statusOnHold.node.status, "completed");

        const payloadOnHost = await upsertGraphNode(pool, {
          id: dueOnHost.node.id,
          type: "task",
          title: dueOnHost.node.title,
          payload: { media_type: "text/plain", storage: "inline", body: "leftover split note" },
          base_updated_at: dueOnHost.node.updated_at,
        });
        assert.equal(isToolError(payloadOnHost), false);
        if (isToolError(payloadOnHost)) {
          return;
        }
        assert.equal(payloadOnHost.node.payload.body, "leftover split note");

        const rewriteUrl = await upsertGraphNode(pool, {
          id: payloadOnHost.node.id,
          type: "task",
          title: payloadOnHost.node.title,
          url: { system: "calendar", id: "evt-fixture-split-unrelated-1" },
          base_updated_at: payloadOnHost.node.updated_at,
        });
        assert.equal(isToolError(rewriteUrl), true);
        if (isToolError(rewriteUrl)) {
          assert.match(rewriteUrl.error, /belongs with live receipt owner/);
        }

        const rewriteReceipt = await upsertGraphNode(pool, {
          id: statusOnHold.node.id,
          type: "task",
          title: statusOnHold.node.title,
          data: {
            receipt: { system: "calendar", id: "evt-fixture-split-unrelated-1", kind: "cleared" },
          },
          base_updated_at: statusOnHold.node.updated_at,
        });
        assert.equal(isToolError(rewriteReceipt), true);
        if (isToolError(rewriteReceipt)) {
          assert.match(rewriteReceipt.error, /belongs with live url owner/);
        }
      });

      await t.test("gmail drafted patches to sent; drive url does not take a receipt home", async () => {
        const draft = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway drafted mail task",
          data: {
            receipt: { system: "gmail", id: "msg-fixture-draft-1", kind: "drafted" },
          },
        });
        assert.equal(isToolError(draft), false);
        if (isToolError(draft)) {
          return;
        }
        assert.deepEqual(draft.node.data.receipt, {
          system: "gmail",
          id: "msg-fixture-draft-1",
          kind: "drafted",
        });

        const sent = await upsertGraphNode(pool, {
          id: draft.node.id,
          type: "task",
          title: "Throwaway drafted mail task",
          data: {
            receipt: { system: "gmail", id: "msg-fixture-sent-mail-1", kind: "sent" },
          },
          base_updated_at: draft.node.updated_at,
        });
        assert.equal(isToolError(sent), false);
        if (isToolError(sent)) {
          return;
        }
        assert.deepEqual(sent.node.data.receipt, {
          system: "gmail",
          id: "msg-fixture-sent-mail-1",
          kind: "sent",
        });

        const drive = await upsertGraphNode(pool, {
          type: "note",
          title: "Throwaway drive url",
          url: { system: "drive", id: "file-fixture-1" },
        });
        assert.equal(isToolError(drive), false);
      });

      await t.test("receipt null clears; merge keeps url; padded id trims", async () => {
        const created = await upsertGraphNode(pool, {
          type: "task",
          title: "Throwaway clear receipt task",
          url: { system: "gmail", id: "msg-fixture-1" },
          data: {
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
        assert.deepEqual(cleared.node.metadata.url, { system: "gmail", id: "msg-fixture-1" });

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
          assert.deepEqual(got.node.metadata.url, { system: "gmail", id: "msg-fixture-1" });
        }
      });
    } finally {
      await pool.end();
    }
  },
);
