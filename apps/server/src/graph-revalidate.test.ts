import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import {
  deleteGraphNode,
  getGraphNode,
  inspectOntology,
  linkGraphNodes,
  manageRelation,
  manageType,
  unlinkGraphNodes,
  upsertGraphNode,
} from "./graph.js";
import { DESTRUCTIVE } from "./write-context.js";

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
  "retype and delete refuse leftover invalid edges and dangling refs",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_revalidate");
    try {
      await t.test("retype refuses when a live child_of would no longer be allowed", async () => {
        const project = await upsertGraphNode(pool, { type: "project", title: "Ship" });
        const task = await upsertGraphNode(pool, { type: "task", title: "Write spec" });
        if (isToolError(project) || isToolError(task)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: task.node.id,
          to_id: project.node.id,
          relation_type: "child_of",
          from_base_updated_at: task.node.updated_at,
          to_base_updated_at: project.node.updated_at,
        });
        if (isToolError(linked)) {
          assert.fail(linked.error);
          return;
        }

        const retyped = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "note",
          title: "Write spec",
          base_updated_at: task.node.updated_at,
        });
        assert.equal(isToolError(retyped), true);
        if (!isToolError(retyped)) return;
        assert.match(retyped.error, /Cannot retype to "note"/);
        assert.match(retyped.error, /child_of/);
        assert.match(retyped.suggestion ?? "", /Unlink that child_of first/);

        const got = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) return;
        assert.equal(got.node.type, "task");
        assert.equal(got.edges.length, 1);
        assert.equal(got.edges[0]?.relation_type, "child_of");
      });

      await t.test("retype of an about target refuses when the edge would be invalid", async () => {
        const person = await upsertGraphNode(pool, { type: "person", title: "Ada" });
        const note = await upsertGraphNode(pool, { type: "note", title: "About Ada" });
        if (isToolError(person) || isToolError(note)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: note.node.id,
          to_id: person.node.id,
          relation_type: "about",
          from_base_updated_at: note.node.updated_at,
          to_base_updated_at: person.node.updated_at,
        });
        if (isToolError(linked)) {
          assert.fail(linked.error);
          return;
        }

        const retyped = await upsertGraphNode(pool, {
          id: person.node.id,
          type: "note",
          title: "Ada",
          base_updated_at: person.node.updated_at,
        });
        assert.equal(isToolError(retyped), true);
        if (!isToolError(retyped)) return;
        assert.match(retyped.error, /Cannot retype to "note"/);
        assert.match(retyped.error, /about/);
      });

      await t.test("unlink then retype succeeds; same-type update keeps a valid edge", async () => {
        const goal = await upsertGraphNode(pool, { type: "goal", title: "Ship v1" });
        const task = await upsertGraphNode(pool, { type: "task", title: "Cut release" });
        if (isToolError(goal) || isToolError(task)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: task.node.id,
          to_id: goal.node.id,
          relation_type: "child_of",
          from_base_updated_at: task.node.updated_at,
          to_base_updated_at: goal.node.updated_at,
        });
        if (isToolError(linked)) {
          assert.fail(linked.error);
          return;
        }

        const titled = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "task",
          title: "Cut release soon",
          base_updated_at: task.node.updated_at,
        });
        assert.equal(isToolError(titled), false);
        if (isToolError(titled)) return;
        const afterTitle = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(afterTitle), false);
        if (isToolError(afterTitle)) return;
        assert.equal(afterTitle.edges.length, 1);

        const unlinked = await unlinkGraphNodes(
          pool,
          {
            from_id: task.node.id,
            to_id: goal.node.id,
            relation_type: "child_of",
            from_base_updated_at: afterTitle.node.updated_at,
            to_base_updated_at: goal.node.updated_at,
          },
          DESTRUCTIVE,
        );
        assert.equal(isToolError(unlinked), false);

        const retyped = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "note",
          title: "Cut release soon",
          base_updated_at: afterTitle.node.updated_at,
        });
        assert.equal(isToolError(retyped), false);
        if (isToolError(retyped)) return;
        assert.equal(retyped.node.type, "note");
      });

      await t.test("retype without if-match still refuses as missing base_updated_at", async () => {
        const project = await upsertGraphNode(pool, { type: "project", title: "CAS project" });
        const task = await upsertGraphNode(pool, { type: "task", title: "CAS task" });
        if (isToolError(project) || isToolError(task)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: task.node.id,
          to_id: project.node.id,
          relation_type: "child_of",
          from_base_updated_at: task.node.updated_at,
          to_base_updated_at: project.node.updated_at,
        });
        if (isToolError(linked)) {
          assert.fail(linked.error);
          return;
        }
        const missing = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "note",
          title: "CAS task",
        });
        assert.equal(isToolError(missing), true);
        if (!isToolError(missing)) return;
        assert.match(missing.error, /Missing base_updated_at/);
        assert.doesNotMatch(missing.error, /Cannot retype/);
      });

      await t.test("delete ignores a UUID in extra data that is not a declared ref field", async () => {
        const person = await upsertGraphNode(pool, { type: "person", title: "Extra pointer" });
        if (isToolError(person)) {
          assert.fail("upsert failed");
          return;
        }
        const note = await upsertGraphNode(pool, {
          type: "note",
          title: "Loose uuid",
          data: { who: person.node.id },
        });
        assert.equal(isToolError(note), false);
        const deleted = await deleteGraphNode(
          pool,
          { id: person.node.id, base_updated_at: person.node.updated_at },
          DESTRUCTIVE,
        );
        assert.equal(isToolError(deleted), false);
      });

      await t.test("delete refuses when a live ref field still points at the target", async () => {
        const created = await manageType(
          pool,
          {
            action: "create",
            slug: "mention",
            kind: "artifact",
            fields: [{ name: "who", kind: "ref", ref_type: "person", display: "Who" }],
          },
          DESTRUCTIVE,
        );
        assert.equal(isToolError(created), false);
        const person = await upsertGraphNode(pool, { type: "person", title: "Ref Ada" });
        if (isToolError(person)) {
          assert.fail(person.error);
          return;
        }
        const mention = await upsertGraphNode(pool, {
          type: "mention",
          title: "Named Ref Ada",
          data: { who: person.node.id },
        });
        assert.equal(isToolError(mention), false);
        if (isToolError(mention)) return;

        const blocked = await deleteGraphNode(
          pool,
          { id: person.node.id, base_updated_at: person.node.updated_at },
          DESTRUCTIVE,
        );
        assert.equal(isToolError(blocked), true);
        if (!isToolError(blocked)) return;
        assert.match(blocked.error, /still point at this id via ref fields/);
        assert.match(blocked.suggestion ?? "", /data\.<field>: null/);
        assert.ok((blocked.suggestion ?? "").includes(mention.node.id));

        const stillLive = await getGraphNode(pool, person.node.id);
        assert.equal(isToolError(stillLive), false);

        const missingCas = await deleteGraphNode(pool, { id: person.node.id }, DESTRUCTIVE);
        assert.equal(isToolError(missingCas), true);
        if (!isToolError(missingCas)) return;
        assert.match(missingCas.error, /Missing base_updated_at/);
        assert.doesNotMatch(missingCas.error, /ref fields/);

        const cleared = await upsertGraphNode(pool, {
          id: mention.node.id,
          type: "mention",
          title: "Named Ref Ada",
          data: { who: null },
          base_updated_at: mention.node.updated_at,
        });
        assert.equal(isToolError(cleared), false);

        const deleted = await deleteGraphNode(
          pool,
          { id: person.node.id, base_updated_at: person.node.updated_at },
          DESTRUCTIVE,
        );
        assert.equal(isToolError(deleted), false);
        const gone = await getGraphNode(pool, person.node.id);
        assert.equal(isToolError(gone), true);
      });
    } finally {
      await pool.end();
    }
  },
);

test(
  "manage_relation refuses when a live edge would no longer be allowed",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_relation_revalidate");
    try {
      const person = await upsertGraphNode(pool, { type: "person", title: "Constraint Ada" });
      const note = await upsertGraphNode(pool, { type: "note", title: "About Constraint Ada" });
      if (isToolError(person) || isToolError(note)) {
        assert.fail("upsert failed");
        return;
      }
      const linked = await linkGraphNodes(pool, {
        from_id: note.node.id,
        to_id: person.node.id,
        relation_type: "about",
        from_base_updated_at: note.node.updated_at,
        to_base_updated_at: person.node.updated_at,
      });
      if (isToolError(linked)) {
        assert.fail(linked.error);
        return;
      }

      const narrowed = await manageRelation(pool, {
        action: "update",
        slug: "about",
        source_types: ["task"],
      });
      assert.equal(isToolError(narrowed), true);
      if (!isToolError(narrowed)) return;
      assert.match(narrowed.error, /Cannot update relation "about"/);
      assert.match(narrowed.error, /about/);
      assert.match(narrowed.suggestion ?? "", /Unlink that about first/);

      const stillOpen = await inspectOntology(pool, "relations");
      const about = stillOpen.relations.find((relation) => relation.slug === "about");
      assert.deepEqual(about?.source_types, []);

      const unlinked = await unlinkGraphNodes(
        pool,
        {
          from_id: note.node.id,
          to_id: person.node.id,
          relation_type: "about",
          from_base_updated_at: note.node.updated_at,
          to_base_updated_at: person.node.updated_at,
        },
        DESTRUCTIVE,
      );
      assert.equal(isToolError(unlinked), false);

      const allowed = await manageRelation(pool, {
        action: "update",
        slug: "about",
        source_types: ["task"],
      });
      assert.equal(isToolError(allowed), false);
      if (isToolError(allowed)) return;
      assert.deepEqual(allowed.relation.source_types, ["task"]);
    } finally {
      await pool.end();
    }
  },
);
