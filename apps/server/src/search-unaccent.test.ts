import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { searchGraphNodes, upsertGraphNode } from "./graph.js";

const databaseUrl = process.env.DATABASE_URL;

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query("CREATE EXTENSION IF NOT EXISTS unaccent");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  await seedSystemOntology(pool);
  return pool;
}

test(
  "FTS accent-folding: ASCII queries hit accented title/payload/data (and vice versa)",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_unaccent");
    try {
      const accented = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway café title",
        payload: {
          media_type: "text/html",
          storage: "inline",
          body: '<p>visible fiancée payload</p><img alt="naïve alt text" src="x.jpg">',
        },
        data: { token: "résumé" },
      });
      assert.equal(isToolError(accented), false);
      if (isToolError(accented)) {
        return;
      }

      const ascii = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway cafe ascii",
        payload: {
          media_type: "text/plain",
          storage: "inline",
          body: "visible fiancee ascii payload",
        },
        data: { token: "resume" },
      });
      assert.equal(isToolError(ascii), false);
      if (isToolError(ascii)) {
        return;
      }

      await t.test("ASCII query hits accented title", async () => {
        const hits = await searchGraphNodes(pool, { query: "cafe" });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.ok(hits.nodes.some((node) => node.id === accented.node.id));
      });

      await t.test("ASCII query hits accented payload (body + HTML alt)", async () => {
        const fiancee = await searchGraphNodes(pool, { query: "fiancee" });
        assert.equal(isToolError(fiancee), false);
        if (isToolError(fiancee)) {
          return;
        }
        assert.ok(fiancee.nodes.some((node) => node.id === accented.node.id));

        const naive = await searchGraphNodes(pool, { query: "naive" });
        assert.equal(isToolError(naive), false);
        if (isToolError(naive)) {
          return;
        }
        assert.ok(naive.nodes.some((node) => node.id === accented.node.id));
      });

      await t.test("ASCII query hits accented data token", async () => {
        const hits = await searchGraphNodes(pool, { query: "resume" });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.ok(hits.nodes.some((node) => node.id === accented.node.id));
      });

      await t.test("accented query hits ASCII title/payload/data", async () => {
        const cafe = await searchGraphNodes(pool, { query: "café" });
        assert.equal(isToolError(cafe), false);
        if (isToolError(cafe)) {
          return;
        }
        assert.ok(cafe.nodes.some((node) => node.id === ascii.node.id));

        const fiancee = await searchGraphNodes(pool, { query: "fiancée" });
        assert.equal(isToolError(fiancee), false);
        if (isToolError(fiancee)) {
          return;
        }
        assert.ok(fiancee.nodes.some((node) => node.id === ascii.node.id));

        const resume = await searchGraphNodes(pool, { query: "résumé" });
        assert.equal(isToolError(resume), false);
        if (isToolError(resume)) {
          return;
        }
        assert.ok(resume.nodes.some((node) => node.id === ascii.node.id));
      });
    } finally {
      await pool.end();
    }
  },
);
