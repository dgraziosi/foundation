import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { getGraphNode, linkGraphNodes, listGraphActivity, upsertGraphNode } from "./graph.js";

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

async function resetGraph(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM activity");
  await pool.query("DELETE FROM edges");
  await pool.query("DELETE FROM nodes");
}

async function liveCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL",
  );
  return Number(rows[0]?.n ?? 0);
}

async function activityCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM activity");
  return Number(rows[0]?.n ?? 0);
}

async function edgeCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM edges");
  return Number(rows[0]?.n ?? 0);
}

test("batch upsert: atomic write, dry_run, needed/strict", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("upsert_batch");
  try {
    await t.test("single create still returns node and activity_id", async () => {
      await resetGraph(pool);
      const created = await upsertGraphNode(pool, { type: "note", title: "Single still works" });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      assert.equal("dry_run" in created, false);
      assert.equal(created.node.title, "Single still works");
      assert.equal(typeof created.activity_id, "string");
      assert.equal(created.nodes.length, 1);
      const got = await getGraphNode(pool, created.node.id);
      assert.equal(isToolError(got), false);
    });

    await t.test("one invalid row writes nothing", async () => {
      await resetGraph(pool);
      const beforeNodes = await liveCount(pool);
      const beforeActivity = await activityCount(pool);
      const refused = await upsertGraphNode(pool, {
        nodes: [
          { type: "note", title: "Would persist" },
          { type: "not_a_type", title: "Bad row" },
        ],
      });
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) return;
      assert.match(refused.error, /nodes\[1\]: Unknown type/);
      assert.equal(await liveCount(pool), beforeNodes);
      assert.equal(await activityCount(pool), beforeActivity);
    });

    await t.test("all-valid batch commits every row", async () => {
      await resetGraph(pool);
      const written = await upsertGraphNode(
        pool,
        {
          nodes: [
            { type: "note", title: "Batch one" },
            { type: "idea", title: "Batch two" },
          ],
        },
        undefined,
        { writer: { actor: "agent", actor_label: "batch-agent" } },
      );
      assert.equal(isToolError(written), false);
      if (isToolError(written)) return;
      assert.equal("node" in written, false);
      assert.equal(written.nodes.length, 2);
      assert.equal(written.nodes[0]?.node.title, "Batch one");
      assert.equal(written.nodes[1]?.node.title, "Batch two");
      assert.notEqual(written.nodes[0]?.activity_id, written.nodes[1]?.activity_id);
      assert.equal(await liveCount(pool), 2);

      const listed = await listGraphActivity(pool, {});
      assert.equal(isToolError(listed), false);
      if (isToolError(listed)) return;
      const actors = listed.activities.map((row) => row.actor);
      assert.ok(actors.every((actor) => actor === "agent"));
    });

    await t.test("dry_run upsert batch returns snapshots and writes nothing", async () => {
      await resetGraph(pool);
      const preview = await upsertGraphNode(pool, {
        nodes: [
          { type: "note", title: "Preview one" },
          { type: "idea", title: "Preview two" },
        ],
        dry_run: true,
      });
      assert.equal(isToolError(preview), false);
      if (isToolError(preview)) return;
      assert.equal("dry_run" in preview && preview.dry_run, true);
      assert.equal(preview.nodes.length, 2);
      assert.equal(preview.nodes[0]?.node.title, "Preview one");
      assert.equal(preview.nodes[0]?.activity_id, undefined);
      assert.equal(await liveCount(pool), 0);
      assert.equal(await activityCount(pool), 0);
      const missing = await getGraphNode(pool, preview.nodes[0]!.node.id);
      assert.equal(isToolError(missing), true);
    });

    await t.test("dry_run link returns receipts and writes no edges", async () => {
      await resetGraph(pool);
      const note = await upsertGraphNode(pool, { type: "note", title: "Link preview note" });
      const idea = await upsertGraphNode(pool, { type: "idea", title: "Link preview idea" });
      assert.equal(isToolError(note), false);
      assert.equal(isToolError(idea), false);
      if (isToolError(note) || isToolError(idea)) return;
      const beforeActivity = await activityCount(pool);
      const preview = await linkGraphNodes(pool, {
        from_id: note.node.id,
        to_id: idea.node.id,
        relation_type: "inspired_by",
        from_base_updated_at: note.node.updated_at,
        to_base_updated_at: idea.node.updated_at,
        dry_run: true,
      });
      assert.equal(isToolError(preview), false);
      if (isToolError(preview)) return;
      assert.equal("dry_run" in preview && preview.dry_run, true);
      assert.equal(preview.links[0]?.edge.relation_type, "inspired_by");
      assert.equal(preview.links[0]?.activity_id, undefined);
      assert.equal(await edgeCount(pool), 0);
      assert.equal(await activityCount(pool), beforeActivity);
    });

    await t.test("missing needed warns; strict refuses", async () => {
      await resetGraph(pool);
      const warned = await upsertGraphNode(pool, {
        type: "spend",
        title: "Materials bid",
      });
      assert.equal(isToolError(warned), false);
      if (isToolError(warned)) return;
      assert.equal(warned.warnings?.[0]?.code, "missing_needed");
      assert.ok(warned.warnings?.[0]?.fields.includes("amount"));
      assert.equal(await liveCount(pool), 1);

      const refused = await upsertGraphNode(pool, {
        type: "spend",
        title: "Strict bid",
        strict: true,
      });
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) return;
      assert.match(refused.error, /Missing needed fields/);
      assert.equal(await liveCount(pool), 1);

      const dryStrict = await upsertGraphNode(pool, {
        type: "spend",
        title: "Dry strict bid",
        dry_run: true,
        strict: true,
      });
      assert.equal(isToolError(dryStrict), true);
      assert.equal(await liveCount(pool), 1);
    });
  } finally {
    await pool.end();
  }
});
