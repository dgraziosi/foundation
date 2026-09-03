import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import {
  deleteGraphNode,
  getGraphNode,
  linkGraphNodes,
  unlinkGraphNodes,
  upsertGraphNode,
} from "./graph.js";

const databaseUrl = process.env.DATABASE_URL;

async function poolsForSchema(schema: string): Promise<{ a: Pool; b: Pool }> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const options = { options: `-c search_path=${schema},public` };
  const a = createPool(databaseUrl!, options);
  await migrate(a);
  await seedSystemOntology(a);
  const b = createPool(databaseUrl!, options);
  return { a, b };
}

test(
  "two connections racing delete or unlink leave one winner and one mismatch",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const { a, b } = await poolsForSchema("cas_two_connection");
    try {
      await t.test("two deletes on one node: one winner, one mismatch", async () => {
        const created = await upsertGraphNode(a, { type: "note", title: "Race delete" });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const [left, right] = await Promise.all([
          deleteGraphNode(a, {
            id: created.node.id,
            confirm: true,
            base_updated_at: created.node.updated_at,
          }),
          deleteGraphNode(b, {
            id: created.node.id,
            confirm: true,
            base_updated_at: created.node.updated_at,
          }),
        ]);

        const results = [left, right];
        const wins = results.filter((row) => !isToolError(row));
        const losses = results.filter((row) => isToolError(row));
        assert.equal(wins.length, 1);
        assert.equal(losses.length, 1);
        if (!isToolError(losses[0])) return;
        assert.match(losses[0].error, /does not match current updated_at/);
        assert.doesNotMatch(losses[0].error, /not found/i);

        const gone = await getGraphNode(a, created.node.id);
        assert.equal(isToolError(gone), true);
      });

      await t.test("two unlinks on one edge: one winner, one mismatch", async () => {
        const note = await upsertGraphNode(a, { type: "note", title: "Race unlink note" });
        const idea = await upsertGraphNode(a, { type: "idea", title: "Race unlink idea" });
        assert.equal(isToolError(note), false);
        assert.equal(isToolError(idea), false);
        if (isToolError(note) || isToolError(idea)) return;

        const linked = await linkGraphNodes(a, {
          from_id: note.node.id,
          to_id: idea.node.id,
          relation_type: "inspired_by",
          from_base_updated_at: note.node.updated_at,
          to_base_updated_at: idea.node.updated_at,
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) return;

        const [left, right] = await Promise.all([
          unlinkGraphNodes(a, {
            from_id: note.node.id,
            to_id: idea.node.id,
            relation_type: "inspired_by",
            confirm: true,
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          }),
          unlinkGraphNodes(b, {
            from_id: note.node.id,
            to_id: idea.node.id,
            relation_type: "inspired_by",
            confirm: true,
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          }),
        ]);

        const results = [left, right];
        const wins = results.filter((row) => !isToolError(row));
        const losses = results.filter((row) => isToolError(row));
        assert.equal(wins.length, 1);
        assert.equal(losses.length, 1);
        if (!isToolError(losses[0])) return;
        assert.match(losses[0].error, /does not match|Edge not found/);
        const still = await getGraphNode(a, note.node.id);
        assert.equal(isToolError(still), false);
        if (isToolError(still)) return;
        assert.equal(still.edges.length, 0);
      });
    } finally {
      await a.end();
      await b.end();
    }
  },
);
