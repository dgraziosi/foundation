import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "@foundation/schema";
import { createPool } from "./client.js";
import { migrate } from "./migrate.js";
import { insertNodeType, listNodeTypes, listRelationTypes } from "./queries.js";
import { seedSystemOntology } from "./seed.js";

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

test(
  "migrate + seed writes system types and relations",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("migrate_seed");
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
      const { rows: fts } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'nodes' AND column_name = 'search_tsv'`,
      );
      assert.equal(fts[0]?.column_name, "search_tsv");
      const { rows: unaccentExt } = await pool.query<{ extname: string }>(
        `SELECT extname FROM pg_extension WHERE extname = 'unaccent'`,
      );
      assert.equal(unaccentExt[0]?.extname, "unaccent");
      const { rows: unaccentFn } = await pool.query<{ proname: string; provolatile: string }>(
        `SELECT proname, provolatile FROM pg_proc
         WHERE proname = 'foundation_unaccent' AND pronamespace = current_schema()::regnamespace`,
      );
      assert.equal(unaccentFn[0]?.proname, "foundation_unaccent");
      assert.equal(unaccentFn[0]?.provolatile, "i");
      const { rows: tsConfig } = await pool.query<{ cfgname: string }>(
        `SELECT cfgname FROM pg_ts_config
         WHERE cfgname = 'foundation_english' AND cfgnamespace = current_schema()::regnamespace`,
      );
      assert.equal(tsConfig[0]?.cfgname, "foundation_english");
      const { rows: blobCols } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'blobs'
         ORDER BY column_name`,
      );
      assert.deepEqual(
        blobCols.map((row) => row.column_name),
        ["byte_size", "created_at", "id", "media_type", "path", "sha256"],
      );
      const { rows: sha } = await pool.query<{ constraint_name: string }>(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = current_schema() AND table_name = 'blobs'
           AND constraint_type = 'UNIQUE' AND constraint_name = 'blobs_sha256_unique'`,
      );
      assert.equal(sha[0]?.constraint_name, "blobs_sha256_unique");
      const { rows: casCols } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'nodes'
           AND column_name = 'idempotency_key'`,
      );
      assert.equal(casCols[0]?.column_name, "idempotency_key");
      const { rows: tsDefault } = await pool.query<{ column_default: string }>(
        `SELECT column_default FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'nodes'
           AND column_name = 'updated_at'`,
      );
      assert.match(tsDefault[0]?.column_default ?? "", /date_trunc/);
      assert.match(tsDefault[0]?.column_default ?? "", /milliseconds/);
      const { rows: originIdx } = await pool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = current_schema() AND indexname = 'nodes_origin_live_uidx'`,
      );
      assert.equal(originIdx[0]?.indexname, "nodes_origin_live_uidx");
      const { rows: dueIdx } = await pool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = current_schema() AND indexname = 'nodes_due_idx'`,
      );
      assert.equal(dueIdx[0]?.indexname, "nodes_due_idx");
      const { rows: dueFn } = await pool.query<{ proname: string }>(
        `SELECT proname FROM pg_proc
         WHERE proname = 'foundation_iso_date' AND pronamespace = current_schema()::regnamespace`,
      );
      assert.equal(dueFn[0]?.proname, "foundation_iso_date");
      const { rows: dueSafe } = await pool.query<{ d: string | null }>(
        `SELECT foundation_iso_date($1) AS d`,
        ["2026-13-01"],
      );
      assert.equal(dueSafe[0]?.d, null);
      const { rows: dueFeb } = await pool.query<{ d: string | null }>(
        `SELECT foundation_iso_date($1) AS d`,
        ["2026-02-31"],
      );
      assert.equal(dueFeb[0]?.d, null);
      const { rows: dueOk } = await pool.query<{ d: string | null }>(
        `SELECT foundation_iso_date($1) AS d`,
        ["2026-08-27"],
      );
      assert.equal(dueOk[0]?.d, "2026-08-27");
      const { rows: trgmExt } = await pool.query<{ extname: string }>(
        `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
      );
      assert.equal(trgmExt[0]?.extname, "pg_trgm");
      const { rows: titleCols } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'nodes'
           AND column_name IN ('title_norm', 'title_compact')
         ORDER BY column_name`,
      );
      assert.deepEqual(
        titleCols.map((row) => row.column_name),
        ["title_compact", "title_norm"],
      );
      const { rows: titleIdx } = await pool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname IN (
             'nodes_title_norm_idx',
             'nodes_title_compact_idx',
             'nodes_title_norm_trgm_idx',
             'nodes_title_compact_trgm_idx'
           )
         ORDER BY indexname`,
      );
      assert.equal(titleIdx.length, 4);
      const { rows: nameNorm } = await pool.query<{ n: string; c: string }>(
        `SELECT foundation_name_norm($1) AS n, foundation_name_compact($1) AS c`,
        ["Café Luna"],
      );
      assert.equal(nameNorm[0]?.n, "cafe luna");
      assert.equal(nameNorm[0]?.c, "cafeluna");
      const { rows: oBrien } = await pool.query<{ n: string; c: string }>(
        `SELECT foundation_name_norm($1) AS n, foundation_name_compact($1) AS c`,
        ["O'Brien"],
      );
      assert.equal(oBrien[0]?.n, "o brien");
      assert.equal(oBrien[0]?.c, "obrien");
      const { rows: dueCol } = await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'nodes' AND column_name = 'due'`,
      );
      assert.deepEqual(dueCol, []);
      const taskSchema = types.find((type) => type.slug === "task")?.json_schema as {
        properties?: { due?: unknown };
      } | null;
      const goalSchema = types.find((type) => type.slug === "goal")?.json_schema as {
        properties?: { due?: unknown };
      } | null;
      assert.ok(taskSchema?.properties?.due);
      assert.ok(goalSchema?.properties?.due);
      assert.deepEqual(types.find((type) => type.slug === "task")?.parent_types, [
        "goal",
        "project",
      ]);
      assert.ok(typeSlugs.includes("place"));
      assert.ok(typeSlugs.includes("company"));
      assert.ok(typeSlugs.includes("decision"));
      const place = types.find((type) => type.slug === "place");
      assert.equal(place?.kind, "artifact");
      assert.deepEqual(place?.parent_types, []);
      assert.equal(place?.is_system, true);
    } finally {
      await pool.end();
    }
  },
);

test(
  "seed apply on a vault that already has types adds place",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("migrate_seed_place");
    try {
      await migrate(pool);
      await pool.query(
        `
        INSERT INTO node_types (
          slug, label, description, kind, parent_types, json_schema, is_system
        ) VALUES
          ('area', 'Area', 'Existing area', 'spine', '{}', NULL, true),
          ('company', 'Company', 'Existing company', 'artifact', '{}', NULL, true)
        `,
      );
      const before = await listNodeTypes(pool);
      const beforeSlugs = before.map((type) => type.slug);
      assert.ok(beforeSlugs.includes("company"));
      assert.equal(beforeSlugs.includes("place"), false);

      await seedSystemOntology(pool);

      const after = await listNodeTypes(pool);
      const afterSlugs = after.map((type) => type.slug);
      assert.ok(afterSlugs.includes("place"));
      assert.ok(afterSlugs.includes("company"));
      const place = after.find((type) => type.slug === "place");
      assert.equal(place?.label, "Place");
      assert.equal(place?.kind, "artifact");
      assert.deepEqual(place?.parent_types, []);
      assert.equal(place?.description, "A location (home, office, city, venue, …).");
      assert.equal(place?.is_system, true);
      const company = after.find((type) => type.slug === "company");
      assert.equal(company?.is_system, true);
      assert.equal(company?.description, "Existing company");
    } finally {
      await pool.end();
    }
  },
);

test(
  "seed apply keeps a custom description on an already-system place",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("migrate_seed_system_desc");
    try {
      await migrate(pool);
      await pool.query(
        `
        INSERT INTO node_types (
          slug, label, description, kind, parent_types, json_schema, is_system
        ) VALUES (
          'place', 'Place', 'Office, home, and the places we actually go.',
          'artifact', '{}', NULL, true
        )
        `,
      );

      await seedSystemOntology(pool);

      const place = (await listNodeTypes(pool)).find((type) => type.slug === "place");
      assert.equal(place?.is_system, true);
      assert.equal(place?.description, "Office, home, and the places we actually go.");
      assert.equal(place?.label, "Place");
      assert.equal(place?.kind, "artifact");
      assert.deepEqual(place?.parent_types, []);
    } finally {
      await pool.end();
    }
  },
);

test(
  "seed apply takes the seed row when a seed slug already exists as authored",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("migrate_seed_authored");
    try {
      await migrate(pool);
      await insertNodeType(pool, {
        slug: "place",
        label: "Authored Place",
        description: "User-created place before it was a seed.",
        kind: "artifact",
        parent_types: ["area"],
        json_schema: { type: "object" },
      });
      await insertNodeType(pool, {
        slug: "company",
        label: "Authored Company",
        description: "User-created company before it was a seed.",
        kind: "artifact",
        parent_types: ["area"],
        json_schema: { type: "object" },
      });
      await insertNodeType(pool, {
        slug: "meeting",
        label: "Meeting",
        description: "A non-seed authored type.",
        kind: "artifact",
        parent_types: [],
        json_schema: null,
      });
      const before = await listNodeTypes(pool);
      assert.equal(before.find((type) => type.slug === "place")?.is_system, false);
      assert.equal(before.find((type) => type.slug === "company")?.is_system, false);
      assert.equal(before.find((type) => type.slug === "meeting")?.is_system, false);

      const { rows: nodesBefore } = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM nodes",
      );
      assert.equal(nodesBefore[0]?.count, "0");

      await seedSystemOntology(pool);

      const after = await listNodeTypes(pool);
      const place = after.find((type) => type.slug === "place");
      assert.equal(place?.is_system, true);
      assert.equal(place?.label, "Place");
      assert.equal(place?.description, "A location (home, office, city, venue, …).");
      assert.equal(place?.kind, "artifact");
      assert.deepEqual(place?.parent_types, []);
      assert.equal(place?.json_schema, null);

      const company = after.find((type) => type.slug === "company");
      assert.equal(company?.is_system, true);
      assert.equal(company?.label, "Company");
      assert.equal(company?.description, "An organization (employer, vendor, school, …).");
      assert.equal(company?.kind, "artifact");
      assert.deepEqual(company?.parent_types, []);
      assert.equal(company?.json_schema, null);

      const meeting = after.find((type) => type.slug === "meeting");
      assert.equal(meeting?.is_system, false);
      assert.equal(meeting?.label, "Meeting");
      assert.equal(meeting?.description, "A non-seed authored type.");
      assert.equal(meeting?.kind, "artifact");
      assert.deepEqual(meeting?.parent_types, []);

      const afterSlugs = after.map((type) => type.slug).sort();
      const expectedSlugs = [...SEED_NODE_TYPES.map((type) => type.slug), "meeting"].sort();
      assert.deepEqual(afterSlugs, expectedSlugs);

      const { rows: nodesAfter } = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM nodes",
      );
      assert.equal(nodesAfter[0]?.count, "0");
    } finally {
      await pool.end();
    }
  },
);
