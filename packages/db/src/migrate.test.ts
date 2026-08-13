import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "@foundation/schema";
import { createPool } from "./client.js";
import { migrate } from "./migrate.js";
import { listNodeTypes, listRelationTypes } from "./queries.js";
import { seedSystemOntology } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "migrate + seed writes system types and relations",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = createPool(databaseUrl);
    try {
      await migrate(pool);
      await seedSystemOntology(pool);
      const types = await listNodeTypes(pool);
      const relations = await listRelationTypes(pool);
      const typeSlugs = types.map((type) => type.slug);
      const relationSlugs = relations.map((type) => type.slug);
      for (const seed of SEED_NODE_TYPES) {
        assert.ok(typeSlugs.includes(seed.slug), `missing type ${seed.slug}`);
      }
      for (const seed of SEED_RELATION_TYPES) {
        assert.ok(relationSlugs.includes(seed.slug), `missing relation ${seed.slug}`);
      }
      assert.equal(
        types.find((type) => type.slug === "lesson")?.parent_types.includes("area"),
        true,
      );
      assert.equal(relations.find((type) => type.slug === "child_of")?.kind, "hierarchy");
      const { rows } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'nodes' AND column_name IN ('permalink', 'parent', 'relations', 'content')`,
      );
      assert.deepEqual(rows, []);
    } finally {
      await pool.end();
    }
  },
);
