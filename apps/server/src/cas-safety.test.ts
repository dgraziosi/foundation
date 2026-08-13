import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import {
  getGraphNode,
  linkGraphNodes,
  listGraphActivity,
  upsertGraphNode,
} from "./graph.js";

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
  "CAS / multi-writer safety: if-match, data merge, create idempotency, activity actor",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("cas_safety");
    try {
      await t.test("stale base_updated_at refuses an upsert update", async () => {
        const created = await upsertGraphNode(pool, {
          type: "note",
          title: "Shared note",
          data: { a: 1, b: 2 },
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const first = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "note",
          title: "Writer A",
          data: { a: 9 },
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(first), false);
        if (isToolError(first)) return;

        const stale = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "note",
          title: "Writer B clobber",
          data: { b: 0 },
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(stale), true);
        if (!isToolError(stale)) return;
        assert.match(stale.error, /does not match current updated_at/);
        assert.match(stale.suggestion ?? "", /get and retry/);

        const got = await getGraphNode(pool, created.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) return;
        assert.equal(got.node.title, "Writer A");
        assert.equal(got.node.data.a, 9);
        assert.equal(got.node.data.b, 2);
      });

      await t.test("missing base_updated_at refuses an update", async () => {
        const created = await upsertGraphNode(pool, { type: "note", title: "Need if-match" });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const missing = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "note",
          title: "No timestamp",
        });
        assert.equal(isToolError(missing), true);
        if (!isToolError(missing)) return;
        assert.match(missing.error, /Missing base_updated_at/);
        assert.match(missing.suggestion ?? "", /if-match/);
      });

      await t.test("partial data patch JSONB-merges and does not wipe other keys", async () => {
        const created = await upsertGraphNode(pool, {
          type: "trip",
          title: "Kyoto",
          data: { start: "2026-03-20", city: "Kyoto", days: 4 },
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const patched = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "trip",
          title: "Kyoto",
          data: { city: "Osaka" },
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(patched), false);
        if (isToolError(patched)) return;
        assert.equal(patched.node.data.start, "2026-03-20");
        assert.equal(patched.node.data.city, "Osaka");
        assert.equal(patched.node.data.days, 4);
      });

      await t.test("retried create with the same idempotency_key does not twin a node", async () => {
        const first = await upsertGraphNode(pool, {
          type: "person",
          title: "Liz",
          idempotency_key: "create-liz-1",
          actor: "agent",
          actor_label: "chief",
        });
        assert.equal(isToolError(first), false);
        if (isToolError(first)) return;

        const retry = await upsertGraphNode(pool, {
          type: "person",
          title: "Elizabeth",
          idempotency_key: "create-liz-1",
          actor_label: "librarian",
        });
        assert.equal(isToolError(retry), false);
        if (isToolError(retry)) return;
        assert.equal(retry.node.id, first.node.id);
        assert.equal(retry.activity_id, first.activity_id);
        assert.equal(retry.node.title, "Liz");

        const { rows } = await pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM nodes WHERE title IN ('Liz', 'Elizabeth')`,
        );
        assert.equal(rows[0]?.count, "1");
      });

      await t.test("activity stores actor / actor_label from the writer", async () => {
        const created = await upsertGraphNode(pool, {
          type: "note",
          title: "Who wrote",
          actor: "user",
          actor_label: "danny",
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const listed = await listGraphActivity(pool, { target: created.node.id });
        assert.equal(isToolError(listed), false);
        if (isToolError(listed)) return;
        const row = listed.activities.find((item) => item.id === created.activity_id);
        assert.ok(row);
        assert.equal(row?.actor, "user");
        assert.equal(row?.actor_label, "danny");
      });

      await t.test("stale from_base_updated_at refuses a link", async () => {
        const area = await upsertGraphNode(pool, { type: "area", title: "Health" });
        const project = await upsertGraphNode(pool, { type: "project", title: "Sleep" });
        assert.equal(isToolError(area), false);
        assert.equal(isToolError(project), false);
        if (isToolError(area) || isToolError(project)) return;

        const renamed = await upsertGraphNode(pool, {
          id: project.node.id,
          type: "project",
          title: "Sleep well",
          base_updated_at: project.node.updated_at,
        });
        assert.equal(isToolError(renamed), false);
        if (isToolError(renamed)) return;

        const stale = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: area.node.updated_at,
          actor_label: "chief",
        });
        assert.equal(isToolError(stale), true);
        if (!isToolError(stale)) return;
        assert.match(stale.error, /from_base_updated_at does not match/);

        const linked = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
          from_base_updated_at: renamed.node.updated_at,
          to_base_updated_at: area.node.updated_at,
          actor: "agent",
          actor_label: "chief",
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) return;

        const listed = await listGraphActivity(pool, { target: linked.edge.id });
        assert.equal(isToolError(listed), false);
        if (isToolError(listed)) return;
        const row = listed.activities.find((item) => item.id === linked.activity_id);
        assert.equal(row?.actor, "agent");
        assert.equal(row?.actor_label, "chief");
      });
    } finally {
      await pool.end();
    }
  },
);
