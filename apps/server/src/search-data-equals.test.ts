import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { SEARCH_NO_SELECTOR_SUGGESTION, isToolError } from "@foundation/schema";
import { searchGraphNodes, upsertGraphNode } from "./graph.js";

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
  "search data_equals filters top-level data keys",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_data_equals");
    try {
      const keyed = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway keyed note",
        data: { kind: "fixture_alpha", status: "potential" },
      });
      const other = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway other-kind note",
        data: { kind: "fixture_beta", status: "potential" },
      });
      const unkeyed = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway unkeyed note",
      });
      const typed = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway keyed task",
        data: { kind: "fixture_alpha" },
      });
      assert.equal(isToolError(keyed), false);
      assert.equal(isToolError(other), false);
      assert.equal(isToolError(unkeyed), false);
      assert.equal(isToolError(typed), false);
      if (isToolError(keyed) || isToolError(other) || isToolError(unkeyed) || isToolError(typed)) {
        return;
      }

      await t.test("filter by a synthetic data key/value", async () => {
        const hit = await searchGraphNodes(pool, { data_equals: { kind: "fixture_alpha" } });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.ok(hit.nodes.some((node) => node.id === keyed.node.id));
        assert.ok(hit.nodes.some((node) => node.id === typed.node.id));
        assert.equal(
          hit.nodes.some((node) => node.id === other.node.id),
          false,
        );
      });

      await t.test("miss when the value differs", async () => {
        const miss = await searchGraphNodes(pool, { data_equals: { kind: "fixture_gamma" } });
        assert.equal(isToolError(miss), false);
        if (isToolError(miss)) {
          return;
        }
        assert.deepEqual(miss.nodes, []);
      });

      await t.test("combine with type", async () => {
        const notes = await searchGraphNodes(pool, {
          type: "note",
          data_equals: { kind: "fixture_alpha" },
        });
        assert.equal(isToolError(notes), false);
        if (isToolError(notes)) {
          return;
        }
        assert.ok(notes.nodes.some((node) => node.id === keyed.node.id));
        assert.equal(
          notes.nodes.some((node) => node.id === typed.node.id),
          false,
        );
      });

      await t.test("unkeyed nodes do not match", async () => {
        const hit = await searchGraphNodes(pool, { data_equals: { kind: "fixture_alpha" } });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(
          hit.nodes.some((node) => node.id === unkeyed.node.id),
          false,
        );

        const both = await searchGraphNodes(pool, {
          data_equals: { kind: "fixture_alpha", status: "potential" },
        });
        assert.equal(isToolError(both), false);
        if (isToolError(both)) {
          return;
        }
        assert.ok(both.nodes.some((node) => node.id === keyed.node.id));
        assert.equal(
          both.nodes.some((node) => node.id === typed.node.id),
          false,
        );
      });

      await t.test("UUID query still applies data_equals", async () => {
        const miss = await searchGraphNodes(pool, {
          query: keyed.node.id,
          data_equals: { kind: "fixture_gamma" },
        });
        assert.equal(isToolError(miss), false);
        if (!isToolError(miss)) {
          assert.deepEqual(miss.nodes, []);
        }
        const hit = await searchGraphNodes(pool, {
          query: keyed.node.id,
          data_equals: { kind: "fixture_alpha" },
        });
        assert.equal(isToolError(hit), false);
        if (!isToolError(hit)) {
          assert.equal(hit.nodes[0]?.id, keyed.node.id);
        }
      });

      await t.test("empty {} still errors; empty data_equals is not a selector", async () => {
        const none = await searchGraphNodes(pool, {});
        assert.equal(isToolError(none), true);
        if (isToolError(none)) {
          assert.match(none.error, /query or a filter/);
          assert.equal(none.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);
        }

        const emptyEquals = await searchGraphNodes(pool, { data_equals: {} });
        assert.equal(isToolError(emptyEquals), true);
        if (isToolError(emptyEquals)) {
          assert.match(emptyEquals.error, /query or a filter/);
        }
      });
    } finally {
      await pool.end();
    }
  },
);
