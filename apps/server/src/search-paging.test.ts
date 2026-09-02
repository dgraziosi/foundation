import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  LIST_CURSOR_INVALID_SUGGESTION,
  SEARCH_NO_SELECTOR_SUGGESTION,
  SearchInputSchema,
  isToolError,
} from "@foundation/schema";
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
  "search pages with a keyset cursor and an honest count",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_paging");
    try {
      for (let i = 1; i <= 25; i += 1) {
        const n = String(i).padStart(2, "0");
        const created = await upsertGraphNode(pool, {
          type: "note",
          title: `Paging fixture ${n}`,
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) {
          return;
        }
      }
      for (const title of ["Paging decoy task A", "Paging decoy task B", "Paging decoy task C"]) {
        const created = await upsertGraphNode(pool, { type: "task", title });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) {
          return;
        }
      }

      await t.test("default type list is 20 of 25, then cursor page two", async () => {
        const first = await searchGraphNodes(pool, { type: "note" });
        assert.equal(isToolError(first), false);
        if (isToolError(first)) {
          return;
        }
        assert.equal(first.nodes.length, 20);
        assert.equal(first.count, 25);
        assert.equal(typeof first.next, "string");

        const second = await searchGraphNodes(pool, { type: "note", cursor: first.next });
        assert.equal(isToolError(second), false);
        if (isToolError(second)) {
          return;
        }
        assert.equal(second.nodes.length, 5);
        assert.equal(second.count, 25);
        assert.equal(second.next, undefined);

        const firstIds = new Set(first.nodes.map((node) => node.id));
        const secondIds = second.nodes.map((node) => node.id);
        assert.equal(secondIds.every((id) => !firstIds.has(id)), true);
        assert.equal(firstIds.size + secondIds.length, 25);
      });

      await t.test("count follows filters", async () => {
        const notes = await searchGraphNodes(pool, { type: "note" });
        const tasks = await searchGraphNodes(pool, { type: "task" });
        assert.equal(isToolError(notes), false);
        assert.equal(isToolError(tasks), false);
        if (isToolError(notes) || isToolError(tasks)) {
          return;
        }
        assert.equal(notes.count, 25);
        assert.equal(tasks.count, 3);
      });

      await t.test("offset is not a page", async () => {
        const parsed = SearchInputSchema.parse({ type: "note", offset: 20, limit: 20 });
        assert.equal("offset" in parsed, false);
        const first = await searchGraphNodes(pool, { type: "note", limit: 20 });
        const pretended = await searchGraphNodes(pool, parsed);
        assert.equal(isToolError(first), false);
        assert.equal(isToolError(pretended), false);
        if (isToolError(first) || isToolError(pretended)) {
          return;
        }
        assert.deepEqual(
          pretended.nodes.map((node) => node.id),
          first.nodes.map((node) => node.id),
        );
        assert.equal(pretended.count, 25);
      });

      await t.test("cursor is not a selector and junk cursor refuses", async () => {
        const first = await searchGraphNodes(pool, { type: "note" });
        assert.equal(isToolError(first), false);
        if (isToolError(first) || !first.next) {
          return;
        }
        const none = await searchGraphNodes(pool, { cursor: first.next });
        assert.equal(isToolError(none), true);
        if (!isToolError(none)) {
          return;
        }
        assert.equal(none.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);

        const junk = await searchGraphNodes(pool, { type: "note", cursor: "not-a-cursor" });
        assert.equal(isToolError(junk), true);
        if (!isToolError(junk)) {
          return;
        }
        assert.equal(junk.suggestion, LIST_CURSOR_INVALID_SUGGESTION);
      });

      await t.test("lexical page two uses the issued cursor", async () => {
        const first = await searchGraphNodes(pool, { query: "PagingToken", type: "note" });
        assert.equal(isToolError(first), false);
        if (isToolError(first)) {
          return;
        }
        assert.equal(first.nodes.length, 0);
        assert.equal(first.count, 0);

        for (let i = 1; i <= 25; i += 1) {
          const created = await upsertGraphNode(pool, {
            type: "note",
            title: `PagingToken lexical ${String(i).padStart(2, "0")}`,
          });
          assert.equal(isToolError(created), false);
          if (isToolError(created)) {
            return;
          }
        }
        const pageOne = await searchGraphNodes(pool, { query: "PagingToken", limit: 20 });
        assert.equal(isToolError(pageOne), false);
        if (isToolError(pageOne) || !pageOne.next) {
          return;
        }
        assert.equal(pageOne.nodes.length, 20);
        assert.equal(pageOne.count, 25);
        const pageTwo = await searchGraphNodes(pool, {
          query: "PagingToken",
          cursor: pageOne.next,
          limit: 20,
        });
        assert.equal(isToolError(pageTwo), false);
        if (isToolError(pageTwo)) {
          return;
        }
        assert.equal(pageTwo.nodes.length, 5);
        assert.equal(pageTwo.count, 25);
        assert.equal(pageTwo.next, undefined);
      });
    } finally {
      await pool.end();
    }
  },
);
