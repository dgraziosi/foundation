import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError, type LinkInput } from "@foundation/schema";
import {
  getGraphNode,
  linkGraphNodes,
  listGraphActivity,
  undoGraphActivity,
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

async function resetGraph(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM activity");
  await pool.query("DELETE FROM edges");
  await pool.query("DELETE FROM nodes");
}

async function edgeCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM edges");
  return Number(rows[0]?.n ?? 0);
}

async function linkActivityCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM activity WHERE action = 'link'",
  );
  return Number(rows[0]?.n ?? 0);
}

test("batch link: two forms, atomic write, shared-node CAS, undo per receipt", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("link_batch");
  try {
    await t.test("flat one-edge still returns edge, activity_id, and links[0]", async () => {
      await resetGraph(pool);
      const note = await upsertGraphNode(pool, { type: "note", title: "Flat note" });
      const idea = await upsertGraphNode(pool, { type: "idea", title: "Flat idea" });
      assert.equal(isToolError(note), false);
      assert.equal(isToolError(idea), false);
      if (isToolError(note) || isToolError(idea)) return;

      const linked = await linkGraphNodes(pool, {
        from_id: note.node.id,
        to_id: idea.node.id,
        relation_type: "inspired_by",
        from_base_updated_at: note.node.updated_at,
        to_base_updated_at: idea.node.updated_at,
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      assert.equal(linked.edge.relation_type, "inspired_by");
      assert.equal(linked.links.length, 1);
      assert.equal(linked.links[0]?.activity_id, linked.activity_id);
      assert.equal(linked.links[0]?.edge.id, linked.edge.id);

      const afterNote = await getGraphNode(pool, note.node.id);
      assert.equal(isToolError(afterNote), false);
      if (isToolError(afterNote)) return;
      assert.equal(afterNote.node.updated_at, note.node.updated_at);
    });

    await t.test("edges of one returns links only", async () => {
      await resetGraph(pool);
      const note = await upsertGraphNode(pool, { type: "note", title: "Single batch note" });
      const idea = await upsertGraphNode(pool, { type: "idea", title: "Single batch idea" });
      if (isToolError(note) || isToolError(idea)) {
        assert.fail("upsert failed");
        return;
      }
      const linked = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: note.node.id,
            to_id: idea.node.id,
            relation_type: "references",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      assert.equal("edge" in linked, false);
      assert.equal(linked.links.length, 1);
      assert.equal(linked.links[0]?.edge.relation_type, "references");
    });

    await t.test("several known-UUID edges write together with one receipt each", async () => {
      await resetGraph(pool);
      const person = await upsertGraphNode(pool, { type: "person", title: "Ada Example" });
      const noteA = await upsertGraphNode(pool, { type: "note", title: "Note A" });
      const noteB = await upsertGraphNode(pool, { type: "note", title: "Note B" });
      if (isToolError(person) || isToolError(noteA) || isToolError(noteB)) {
        assert.fail("upsert failed");
        return;
      }
      const linked = await linkGraphNodes(pool, {
        actor_label: "batch-agent",
        edges: [
          {
            from_id: noteA.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteA.node.updated_at,
            to_base_updated_at: person.node.updated_at,
          },
          {
            from_id: noteB.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteB.node.updated_at,
            to_base_updated_at: person.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      assert.equal(linked.links.length, 2);
      assert.equal(linked.links[0]?.edge.from_id, noteA.node.id);
      assert.equal(linked.links[1]?.edge.from_id, noteB.node.id);
      assert.notEqual(linked.links[0]?.activity_id, linked.links[1]?.activity_id);

      const listed = await listGraphActivity(pool, { action: "link" });
      assert.equal(isToolError(listed), false);
      if (isToolError(listed)) return;
      const ids = new Set(linked.links.map((item) => item.activity_id));
      const rows = listed.activities.filter((row) => ids.has(row.id));
      assert.equal(rows.length, 2);
      assert.ok(rows.every((row) => row.actor_label === "batch-agent"));
    });

    await t.test("mixed form and in-batch duplicates refuse with no writes", async () => {
      await resetGraph(pool);
      const note = await upsertGraphNode(pool, { type: "note", title: "Dup note" });
      const idea = await upsertGraphNode(pool, { type: "idea", title: "Dup idea" });
      const other = await upsertGraphNode(pool, { type: "idea", title: "Other idea" });
      if (isToolError(note) || isToolError(idea) || isToolError(other)) {
        assert.fail("upsert failed");
        return;
      }

      const mixedInput: LinkInput = {
        from_id: note.node.id,
        to_id: idea.node.id,
        relation_type: "inspired_by",
        from_base_updated_at: note.node.updated_at,
        to_base_updated_at: idea.node.updated_at,
        edges: [
          {
            from_id: note.node.id,
            to_id: other.node.id,
            relation_type: "inspired_by",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: other.node.updated_at,
          },
        ],
      };
      const mixed = await linkGraphNodes(pool, mixedInput);
      assert.equal(isToolError(mixed), true);
      if (!isToolError(mixed)) return;
      assert.match(mixed.error, /not both/);
      assert.equal(await edgeCount(pool), 0);

      const exact = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: note.node.id,
            to_id: idea.node.id,
            relation_type: "relates_to",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          },
          {
            from_id: note.node.id,
            to_id: other.node.id,
            relation_type: "inspired_by",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: other.node.updated_at,
          },
          {
            from_id: note.node.id,
            to_id: idea.node.id,
            relation_type: "relates_to",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(exact), true);
      if (!isToolError(exact)) return;
      assert.match(exact.error, /edges\[2\]: Duplicate edge in batch/);
      assert.equal(await edgeCount(pool), 0);
      assert.equal(await linkActivityCount(pool), 0);

      const symmetric = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: note.node.id,
            to_id: idea.node.id,
            relation_type: "relates_to",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          },
          {
            from_id: idea.node.id,
            to_id: note.node.id,
            relation_type: "relates_to",
            from_base_updated_at: idea.node.updated_at,
            to_base_updated_at: note.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(symmetric), true);
      if (!isToolError(symmetric)) return;
      assert.match(symmetric.error, /edges\[1\]: Symmetric duplicate in batch/);
      assert.equal(await edgeCount(pool), 0);
    });

    await t.test("second child_of in the same batch refuses and writes nothing", async () => {
      await resetGraph(pool);
      const areaA = await upsertGraphNode(pool, { type: "area", title: "Area A" });
      const areaB = await upsertGraphNode(pool, { type: "area", title: "Area B" });
      const project = await upsertGraphNode(pool, { type: "project", title: "Two parents" });
      if (isToolError(areaA) || isToolError(areaB) || isToolError(project)) {
        assert.fail("upsert failed");
        return;
      }
      const refused = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: project.node.id,
            to_id: areaA.node.id,
            relation_type: "child_of",
            from_base_updated_at: project.node.updated_at,
            to_base_updated_at: areaA.node.updated_at,
          },
          {
            from_id: project.node.id,
            to_id: areaB.node.id,
            relation_type: "child_of",
            from_base_updated_at: project.node.updated_at,
            to_base_updated_at: areaB.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) return;
      assert.match(refused.error, /edges\[1\]:.*child_of parent/);
      assert.equal(await edgeCount(pool), 0);
    });

    await t.test("shared-node CAS: agreed timestamp writes; disagreeing timestamps refuse", async () => {
      await resetGraph(pool);
      const person = await upsertGraphNode(pool, { type: "person", title: "Shared CAS" });
      const noteA = await upsertGraphNode(pool, { type: "note", title: "CAS A" });
      const noteB = await upsertGraphNode(pool, { type: "note", title: "CAS B" });
      if (isToolError(person) || isToolError(noteA) || isToolError(noteB)) {
        assert.fail("upsert failed");
        return;
      }

      const disagree = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: noteA.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteA.node.updated_at,
            to_base_updated_at: person.node.updated_at,
          },
          {
            from_id: noteB.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteB.node.updated_at,
            to_base_updated_at: "2020-01-01T00:00:00.000Z",
          },
        ],
      });
      assert.equal(isToolError(disagree), true);
      if (!isToolError(disagree)) return;
      assert.match(disagree.error, /edges\[1\]: to_base_updated_at disagrees with edges\[0\]/);
      assert.equal(await edgeCount(pool), 0);

      const stale = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: noteA.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteA.node.updated_at,
            to_base_updated_at: "2020-01-01T00:00:00.000Z",
          },
        ],
      });
      assert.equal(isToolError(stale), true);
      if (!isToolError(stale)) return;
      assert.match(stale.error, /to_base_updated_at does not match/);
    });

    await t.test("shared node: later edge that omits if-match refuses and writes nothing", async () => {
      await resetGraph(pool);
      const person = await upsertGraphNode(pool, { type: "person", title: "Shared person" });
      const noteA = await upsertGraphNode(pool, { type: "note", title: "Note one" });
      const noteB = await upsertGraphNode(pool, { type: "note", title: "Note two" });
      if (isToolError(person) || isToolError(noteA) || isToolError(noteB)) {
        assert.fail("upsert failed");
        return;
      }

      const omitted = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: noteA.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteA.node.updated_at,
            to_base_updated_at: person.node.updated_at,
          },
          {
            from_id: noteB.node.id,
            to_id: person.node.id,
            relation_type: "about",
            from_base_updated_at: noteB.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(omitted), true);
      if (!isToolError(omitted)) return;
      assert.match(omitted.error, /edges\[1\]: Missing to_base_updated_at/);
      assert.equal(await edgeCount(pool), 0);
      assert.equal(await linkActivityCount(pool), 0);
    });

    await t.test("relates_to without upgrade succeeds and suggests; it does not fail the batch", async () => {
      await resetGraph(pool);
      const area = await upsertGraphNode(pool, { type: "area", title: "Work" });
      const project = await upsertGraphNode(pool, { type: "project", title: "Ship" });
      const note = await upsertGraphNode(pool, { type: "note", title: "Context" });
      if (isToolError(area) || isToolError(project) || isToolError(note)) {
        assert.fail("upsert failed");
        return;
      }
      const linked = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: project.node.id,
            to_id: area.node.id,
            relation_type: "relates_to",
            from_base_updated_at: project.node.updated_at,
            to_base_updated_at: area.node.updated_at,
          },
          {
            from_id: note.node.id,
            to_id: project.node.id,
            relation_type: "inspired_by",
            from_base_updated_at: note.node.updated_at,
            to_base_updated_at: project.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      assert.equal(linked.links.length, 2);
      assert.equal(linked.links[0]?.edge.relation_type, "relates_to");
      assert.match(linked.links[0]?.suggestion ?? "", /child_of/);
      assert.equal(linked.links[1]?.suggestion, undefined);
    });

    await t.test("undo of one receipt leaves the other edge", async () => {
      await resetGraph(pool);
      const noteA = await upsertGraphNode(pool, { type: "note", title: "Undo A" });
      const noteB = await upsertGraphNode(pool, { type: "note", title: "Undo B" });
      const idea = await upsertGraphNode(pool, { type: "idea", title: "Undo idea" });
      if (isToolError(noteA) || isToolError(noteB) || isToolError(idea)) {
        assert.fail("upsert failed");
        return;
      }
      const linked = await linkGraphNodes(pool, {
        edges: [
          {
            from_id: noteA.node.id,
            to_id: idea.node.id,
            relation_type: "inspired_by",
            from_base_updated_at: noteA.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          },
          {
            from_id: noteB.node.id,
            to_id: idea.node.id,
            relation_type: "inspired_by",
            from_base_updated_at: noteB.node.updated_at,
            to_base_updated_at: idea.node.updated_at,
          },
        ],
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      const first = linked.links[0]!;
      const second = linked.links[1]!;

      const undone = await undoGraphActivity(pool, {
        id: first.activity_id,
        confirm: true,
        from_base_updated_at: noteA.node.updated_at,
        to_base_updated_at: idea.node.updated_at,
      });
      assert.equal(isToolError(undone), false);

      const afterA = await getGraphNode(pool, noteA.node.id);
      const afterB = await getGraphNode(pool, noteB.node.id);
      assert.equal(isToolError(afterA), false);
      assert.equal(isToolError(afterB), false);
      if (isToolError(afterA) || isToolError(afterB)) return;
      assert.equal(afterA.edges.length, 0);
      assert.equal(afterB.edges.length, 1);
      assert.equal(afterB.edges[0]?.id, second.edge.id);
    });
  } finally {
    await pool.end();
  }
});
