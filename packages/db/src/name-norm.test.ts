import assert from "node:assert/strict";
import { test } from "node:test";
import { NAME_NORM_ALIGNMENT_FIXTURES, nameCompact, nameNorm } from "@foundation/schema";
import { createPool } from "./client.js";
import { migrate } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "TypeScript nameNorm matches foundation_name_norm for folds that used to diverge",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const admin = createPool(databaseUrl);
    await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
    await admin.query("CREATE EXTENSION IF NOT EXISTS unaccent");
    await admin.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await admin.query("DROP SCHEMA IF EXISTS name_norm_align CASCADE");
    await admin.query("CREATE SCHEMA name_norm_align");
    await admin.end();
    const pool = createPool(databaseUrl, { options: "-c search_path=name_norm_align,public" });
    try {
      await migrate(pool);
      for (const fixture of NAME_NORM_ALIGNMENT_FIXTURES) {
        assert.equal(nameNorm(fixture.raw), fixture.norm, `ts norm ${fixture.raw}`);
        assert.equal(nameCompact(fixture.raw), fixture.compact, `ts compact ${fixture.raw}`);
        const { rows } = await pool.query<{ n: string; c: string }>(
          `SELECT foundation_name_norm($1) AS n, foundation_name_compact($1) AS c`,
          [fixture.raw],
        );
        assert.equal(rows[0]?.n, fixture.norm, `sql norm ${fixture.raw}`);
        assert.equal(rows[0]?.c, fixture.compact, `sql compact ${fixture.raw}`);
        assert.equal(rows[0]?.n, nameNorm(fixture.raw), `ts/sql norm ${fixture.raw}`);
      }
    } finally {
      await pool.end();
    }
  },
);
