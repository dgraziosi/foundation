import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPool,
  explainLookupNodeCandidates,
  explainLookupTitleAccess,
  explainLookupTitleTrgmGin,
  migrate,
  seedSystemOntology,
  type Pool,
} from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { lookupGraphNodes, upsertGraphNode } from "./graph.js";

const databaseUrl = process.env.DATABASE_URL;

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query("CREATE EXTENSION IF NOT EXISTS unaccent");
  await admin.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  await seedSystemOntology(pool);
  return pool;
}

test(
  "lookup 8k-node batch plan and warm-cache timing",
  { skip: !databaseUrl, timeout: 120_000 },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("lookup_bench");
    try {
      await pool.query(`
        INSERT INTO nodes (type, title, status, payload, data, metadata)
        SELECT 'note',
               'Bench note ' || i,
               'active',
               '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
               '{}'::jsonb,
               '{}'::jsonb
        FROM generate_series(1, 7000) AS i
      `);
      await pool.query(`
        INSERT INTO nodes (type, title, status, payload, data, metadata)
        SELECT 'place',
               'Bench place ' || i,
               'active',
               '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
               '{}'::jsonb,
               '{}'::jsonb
        FROM generate_series(1, 200) AS i
      `);
      await pool.query(`
        INSERT INTO nodes (type, title, status, payload, data, metadata)
        SELECT 'person',
               'Bench Person ' || lpad(i::text, 4, '0'),
               'active',
               '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
               jsonb_build_object(
                 'aliases',
                 jsonb_build_array(
                   'BP' || i,
                   'Beep ' || i,
                   'Persona ' || i,
                   'Alias ' || i,
                   'Nick ' || i
                 )
               ),
               '{}'::jsonb
        FROM generate_series(1, 400) AS i
      `);
      await pool.query(`
        INSERT INTO nodes (type, title, status, payload, data, metadata)
        SELECT 'person',
               'Bench Extra ' || i,
               'active',
               '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
               '{}'::jsonb,
               '{}'::jsonb
        FROM generate_series(1, 390) AS i
      `);
      await pool.query(`
        INSERT INTO nodes (type, title, status, payload, data, metadata)
        SELECT 'person',
               'Legacy Alias ' || i,
               'active',
               '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
               jsonb_build_object('aliases', 'malformed'),
               '{}'::jsonb
        FROM generate_series(1, 10) AS i
      `);

      const priya = await upsertGraphNode(pool, {
        type: "person",
        title: "Priya Shah",
        data: { aliases: ["Pree-uh"] },
      });
      const jordan = await upsertGraphNode(pool, { type: "person", title: "Jordan Hale" });
      const alexA = await upsertGraphNode(pool, { type: "person", title: "Alex Rivera" });
      const alexB = await upsertGraphNode(pool, { type: "person", title: "Alex Rivera" });
      const cafe = await upsertGraphNode(pool, { type: "place", title: "Café Luna" });
      assert.equal(isToolError(priya), false);
      assert.equal(isToolError(jordan), false);
      assert.equal(isToolError(alexA), false);
      assert.equal(isToolError(alexB), false);
      assert.equal(isToolError(cafe), false);
      if (
        isToolError(priya) ||
        isToolError(jordan) ||
        isToolError(alexA) ||
        isToolError(alexB) ||
        isToolError(cafe)
      ) {
        return;
      }

      const { rows: counts } = await pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL`,
      );
      assert.ok(Number(counts[0]?.n ?? 0) >= 8000, `expected >= 8000 live nodes, got ${counts[0]?.n}`);

      await pool.query("ANALYZE nodes");

      const titlePlans = await explainLookupTitleAccess(pool, "priya shah");
      assert.match(titlePlans.exact, /nodes_title_norm_idx/);
      const trgmGinPlan = await explainLookupTitleTrgmGin(pool, "priya shah");
      assert.match(trgmGinPlan, /nodes_title_norm_trgm_idx/);

      const inputs = [
        { id: "1", name: "Priya Shah", type: "person" },
        { id: "2", name: "Pree-uh", type: "person" },
        { id: "3", name: "Jorden Hale", type: "person" },
        { id: "4", name: "Alex Rivera", type: "person" },
        { id: "5", name: "Café Luna", type: "place" },
        { id: "6", name: "Bench Person 0001", type: "person" },
        { id: "7", name: "BP2", type: "person" },
        { id: "8", name: "Bench note 12", type: "note" },
        { id: "9", name: "No such person xyz", type: "person" },
        { id: "10", name: "Priya", type: "person" },
        { id: "11", name: "Jordan Hale", type: "person" },
        { id: "12", name: "Cafe Luna", type: "place" },
        { id: "13", name: "Bench Extra 1", type: "person" },
        { id: "14", name: "Legacy Alias 1", type: "person" },
        { id: "15", name: "malformed", type: "person" },
        { id: "16", name: "Beep 9", type: "person" },
        { id: "17", name: "Bench place 3", type: "place" },
        { id: "18", name: priya.node.id, type: "person" },
        { id: "19", name: "Persona 10", type: "person" },
        { id: "20", name: "Jorden Hale", type: "person" },
      ];

      // Warm cache.
      await lookupGraphNodes(pool, { inputs });
      const started = performance.now();
      const found = await lookupGraphNodes(pool, { inputs });
      const elapsedMs = performance.now() - started;
      assert.equal(isToolError(found), false);
      if (isToolError(found)) {
        return;
      }
      assert.equal(found.results.length, 20);
      assert.equal(found.results[0]?.outcome, "exact");
      assert.equal(found.results[1]?.outcome, "alias");
      assert.equal(found.results[2]?.outcome, "candidate");
      assert.equal(found.results[3]?.outcome, "ambiguous");
      assert.equal(found.results[8]?.outcome, "no_match");
      assert.equal(found.results[14]?.outcome, "no_match");
      assert.ok(elapsedMs < 30_000, `lookup hung: ${elapsedMs}ms`);

      const nameInputs = inputs
        .map((item, idx) => ({ idx, name: item.name, type: item.type }))
        .filter((item) => !/^[0-9a-f-]{36}$/i.test(item.name));
      const batchPlan = await explainLookupNodeCandidates(pool, nameInputs);
      // Alias unnest is expected; do not require a JSONB GIN (it would not help trigram).
      assert.match(batchPlan, /jsonb_array_elements|alias/i);

      console.log(
        JSON.stringify(
          {
            lookup_bench: {
              live_nodes: Number(counts[0]?.n ?? 0),
              inputs: 20,
              warm_cache_ms: Math.round(elapsedMs * 10) / 10,
              title_exact_plan: titlePlans.exact,
              title_fuzzy_plan: titlePlans.fuzzy,
              title_trgm_gin_plan: trgmGinPlan,
              batch_plan: batchPlan,
            },
          },
          null,
          2,
        ),
      );
    } finally {
      await pool.end();
    }
  },
);
