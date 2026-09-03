import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  WORKING_SET_NODE_NOT_FOUND_SUGGESTION,
  WorkingSetInputSchema,
  addIsoDays,
  isToolError,
  todayInNewYork,
  type Node,
} from "@foundation/schema";
import {
  deleteGraphNode,
  getGraphNode,
  linkGraphNodes,
  lookupGraphNodes,
  upsertGraphNode,
} from "./graph.js";
import { DESTRUCTIVE } from "./write-context.js";
import { workingSetGraph } from "./working-set.js";

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

async function created(pool: Pool, input: Parameters<typeof upsertGraphNode>[1]): Promise<Node> {
  const result = await upsertGraphNode(pool, input);
  assert.equal(isToolError(result), false);
  if (isToolError(result)) {
    throw new Error(result.error);
  }
  return result.node;
}

async function linked(
  pool: Pool,
  from: Node,
  to: Node,
  relation_type: string,
): Promise<void> {
  const result = await linkGraphNodes(pool, {
    from_id: from.id,
    to_id: to.id,
    relation_type,
    from_base_updated_at: from.updated_at,
    to_base_updated_at: to.updated_at,
  });
  assert.equal(isToolError(result), false);
  if (isToolError(result)) {
    throw new Error(result.error);
  }
}

async function countEdges(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM edges");
  return rows[0]?.n ?? 0;
}

async function countActivity(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM activity");
  return rows[0]?.n ?? 0;
}

test(
  "working_set: hierarchy, area bound, person, task chain, empty, miss, depth, cap, read-only",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("working_set_read");
    const today = todayInNewYork();
    try {
      const area = await created(pool, { type: "area", title: "Health" });
      const project = await created(pool, { type: "project", title: "Morning form" });
      const goal = await created(pool, { type: "goal", title: "Fixture goal" });
      await linked(pool, project, area, "child_of");
      await linked(pool, goal, project, "child_of");

      const overdue = await created(pool, {
        type: "task",
        title: "Overdue drill",
        data: { due: "2020-01-01" },
      });
      const upcoming = await created(pool, {
        type: "task",
        title: "Upcoming drill",
        data: { due: addIsoDays(today, 5) },
      });
      const undated = await created(pool, { type: "task", title: "Undated drill" });
      const done = await created(pool, { type: "task", title: "Done drill" });
      await linked(pool, overdue, goal, "child_of");
      await linked(pool, upcoming, goal, "child_of");
      await linked(pool, undated, goal, "child_of");
      await linked(pool, done, goal, "child_of");
      const completed = await upsertGraphNode(pool, {
        id: done.id,
        type: "task",
        title: done.title,
        status: "completed",
        base_updated_at: done.updated_at,
      });
      assert.equal(isToolError(completed), false);

      const person = await created(pool, { type: "person", title: "Fixture person" });
      const aboutTask = await created(pool, {
        type: "task",
        title: "Call about the fixture person",
        data: { due: addIsoDays(today, 2) },
      });
      const relatedNote = await created(pool, { type: "note", title: "Notes on the fixture person" });
      await linked(pool, aboutTask, person, "about");
      await linked(pool, relatedNote, person, "relates_to");
      const dualPerson = await created(pool, { type: "person", title: "Dual-edge person" });
      const dualTask = await created(pool, { type: "task", title: "Dual-edge task" });
      await linked(pool, dualTask, dualPerson, "about");
      await linked(pool, dualTask, dualPerson, "relates_to");

      const emptyGoal = await created(pool, { type: "goal", title: "Empty fixture goal" });

      const completedGoal = await created(pool, { type: "goal", title: "Finished ancestor" });
      await linked(pool, completedGoal, project, "child_of");
      const markedGoal = await upsertGraphNode(pool, {
        id: completedGoal.id,
        type: "goal",
        title: completedGoal.title,
        status: "completed",
        base_updated_at: completedGoal.updated_at,
      });
      assert.equal(isToolError(markedGoal), false);
      if (isToolError(markedGoal)) {
        return;
      }
      const chainTask = await created(pool, { type: "task", title: "Task under finished ancestor" });
      await linked(pool, chainTask, markedGoal.node, "child_of");

      const farProject = await created(pool, { type: "project", title: "Far window project" });
      await linked(pool, farProject, area, "child_of");
      const farTasks: Node[] = [];
      for (let index = 0; index < 8; index += 1) {
        const task = await created(pool, {
          type: "task",
          title: `Far due ${index}`,
          data: { due: addIsoDays(today, 60) },
        });
        await linked(pool, task, farProject, "child_of");
        farTasks.push(task);
      }
      const windowProject = await created(pool, { type: "project", title: "Window project" });
      await linked(pool, windowProject, area, "child_of");
      const windowOverdue = await created(pool, {
        type: "task",
        title: "Area overdue",
        data: { due: "2020-02-02" },
      });
      const windowSoon = await created(pool, {
        type: "task",
        title: "Area soon",
        data: { due: addIsoDays(today, 3) },
      });
      await linked(pool, windowOverdue, windowProject, "child_of");
      await linked(pool, windowSoon, windowProject, "child_of");

      const extraProjects: Node[] = [];
      for (let index = 0; index < 42; index += 1) {
        const extra = await created(pool, { type: "project", title: `Extra project ${index}` });
        await linked(pool, extra, area, "child_of");
        extraProjects.push(extra);
      }

      const capGoal = await created(pool, { type: "goal", title: "Cap goal" });
      await linked(pool, capGoal, project, "child_of");
      for (let index = 0; index < 41; index += 1) {
        const task = await created(pool, {
          type: "task",
          title: `Cap task ${String(index).padStart(2, "0")}`,
        });
        await linked(pool, task, capGoal, "child_of");
      }

      const suggestProject = await created(pool, { type: "project", title: "Kitchen remodel" });
      const suggestTask = await created(pool, { type: "task", title: "Kitchen remodel punch list" });

      const orphanNote = await created(pool, { type: "note", title: "Lonely capture" });

      await t.test("1. hierarchy root: open children, dues first, completed excluded", async () => {
        const set = await workingSetGraph(pool, { id: goal.id });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.equal(set.walk.work, "children");
        const work = set.items.filter((item) => item.role === "work");
        assert.deepEqual(
          work.map((item) => item.title),
          ["Overdue drill", "Upcoming drill", "Undated drill"],
        );
        assert.equal(
          work.some((item) => item.title === "Done drill"),
          false,
        );
        assert.ok(work.every((item) => item.via.relation === "child_of"));
        assert.ok(work.every((item) => item.via.direction === "incoming"));
        assert.ok(!("suggested_links" in set));
        assert.ok(!("payload" in set.root));

        const withDone = await workingSetGraph(pool, { id: goal.id, include_completed: true });
        assert.equal(isToolError(withDone), false);
        if (isToolError(withDone)) {
          return;
        }
        assert.ok(withDone.items.some((item) => item.title === "Done drill" && item.status === "completed"));
      });

      await t.test("2. area: cap 40 and 14-day window", async () => {
        const set = await workingSetGraph(pool, { id: area.id, depth: 2 });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.equal(set.walk.work, "children");
        assert.deepEqual(set.walk.due_window, { days: 14, timezone: "America/New_York" });
        assert.ok(set.items.length <= 40);
        assert.equal(set.truncated, true);
        assert.equal(
          set.items.some((item) => item.title.startsWith("Far due")),
          false,
        );
        assert.ok(set.items.some((item) => item.title === "Area overdue"));
        assert.ok(set.items.some((item) => item.title === "Area soon"));
      });

      await t.test("3. person: about / relates_to, no child_of", async () => {
        const set = await workingSetGraph(pool, { id: person.id });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.equal(set.walk.work, "about");
        const titles = set.items.map((item) => item.title).sort();
        assert.deepEqual(titles, ["Call about the fixture person", "Notes on the fixture person"]);
        assert.ok(set.items.every((item) => item.via.relation === "about" || item.via.relation === "relates_to"));
        assert.equal(
          set.items.some((item) => item.via.relation === "child_of"),
          false,
        );
        assert.equal(set.walk.relations.includes("child_of"), false);
      });

      await t.test("person with about and relates_to to the same task is one row", async () => {
        const set = await workingSetGraph(pool, { id: dualPerson.id });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        const dual = set.items.filter((item) => item.id === dualTask.id);
        assert.equal(dual.length, 1);
        assert.equal(dual[0]?.via.relation, "about");
        assert.equal(set.items.filter((item) => item.role === "work").length, 1);
      });

      await t.test("4. task: parent chain includes a completed ancestor", async () => {
        const set = await workingSetGraph(pool, { id: chainTask.id });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.equal(set.walk.work, "none");
        assert.equal(set.walk.ancestors, true);
        const parents = set.items.filter((item) => item.role === "parent");
        assert.ok(parents.some((item) => item.title === "Finished ancestor" && item.status === "completed"));
        assert.ok(parents.some((item) => item.title === "Morning form"));
        assert.ok(parents.some((item) => item.title === "Health"));
        assert.ok(parents.every((item) => item.via.relation === "child_of" && item.via.direction === "outgoing"));
      });

      await t.test("5. honest empty on a live root with nothing open", async () => {
        const set = await workingSetGraph(pool, { id: emptyGoal.id });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.deepEqual(set.items, []);
        assert.equal(set.truncated, false);
        assert.equal(set.root.id, emptyGoal.id);

        const isolate = await workingSetGraph(pool, { id: orphanNote.id });
        assert.equal(isToolError(isolate), false);
        if (isToolError(isolate)) {
          return;
        }
        assert.deepEqual(isolate.items, []);
        assert.equal(isolate.walk.work, "none");
      });

      await t.test("6. unknown and deleted id return error + suggestion", async () => {
        const missing = await workingSetGraph(pool, {
          id: "11111111-1111-4111-8111-111111111111",
        });
        assert.equal(isToolError(missing), true);
        if (isToolError(missing)) {
          assert.match(missing.error, /Node not found/);
          assert.equal(missing.suggestion, WORKING_SET_NODE_NOT_FOUND_SUGGESTION);
        }

        const doomed = await created(pool, { type: "note", title: "Soon gone" });
        const deleted = await deleteGraphNode(pool, { id: doomed.id }, DESTRUCTIVE);
        assert.equal(isToolError(deleted), false);
        const gone = await workingSetGraph(pool, { id: doomed.id });
        assert.equal(isToolError(gone), true);
        if (isToolError(gone)) {
          assert.match(gone.error, /Node not found/);
          assert.equal(gone.suggestion, WORKING_SET_NODE_NOT_FOUND_SUGGESTION);
        }
      });

      await t.test("7. depth max 2 and truncated when over the cap", async () => {
        assert.throws(() => WorkingSetInputSchema.parse({ id: area.id, depth: 3 }));

        const shallow = await workingSetGraph(pool, { id: area.id, depth: 1, limit: 40 });
        assert.equal(isToolError(shallow), false);
        if (isToolError(shallow)) {
          return;
        }
        assert.equal(
          shallow.items.some((item) => item.type === "task"),
          false,
        );
        assert.ok(shallow.items.every((item) => item.via.hops === 1 || item.role === "parent"));

        const deep = await workingSetGraph(pool, { id: area.id, depth: 2, limit: 40 });
        assert.equal(isToolError(deep), false);
        if (isToolError(deep)) {
          return;
        }
        assert.ok(deep.items.some((item) => item.via.hops === 2 && item.title === "Area overdue"));
        assert.equal(
          deep.items.some((item) => item.title === "Task under finished ancestor"),
          false,
        );

        const capped = await workingSetGraph(pool, { id: capGoal.id });
        assert.equal(isToolError(capped), false);
        if (isToolError(capped)) {
          return;
        }
        assert.equal(capped.items.length, 40);
        assert.ok(capped.items.filter((item) => item.role === "parent").length >= 1);
        assert.equal(capped.items.filter((item) => item.role === "work").length, 40 - capped.items.filter((item) => item.role === "parent").length);
        assert.equal(capped.truncated, true);
      });

      await t.test("8. read-only: no write and suggested_links stay proposals", async () => {
        const got = await getGraphNode(pool, suggestTask.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.ok(got.suggested_links.length > 0);
        const edgesBefore = await countEdges(pool);
        const activityBefore = await countActivity(pool);
        const set = await workingSetGraph(pool, { id: suggestTask.id });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.ok(!("suggested_links" in set));
        assert.equal(await countEdges(pool), edgesBefore);
        assert.equal(await countActivity(pool), activityBefore);
        const again = await getGraphNode(pool, suggestTask.id);
        assert.equal(isToolError(again), false);
        if (isToolError(again)) {
          return;
        }
        assert.equal(again.edges.length, got.edges.length);
      });

      await t.test("lookup then one working_set returns the bounded open set", async () => {
        const found = await lookupGraphNodes(pool, {
          inputs: [{ name: "Fixture goal", type: "goal" }],
        });
        assert.equal(isToolError(found), false);
        if (isToolError(found)) {
          return;
        }
        assert.equal(found.results[0]?.outcome, "exact");
        const id = found.results[0]?.candidates[0]?.id;
        assert.equal(id, goal.id);
        const set = await workingSetGraph(pool, { id: id! });
        assert.equal(isToolError(set), false);
        if (isToolError(set)) {
          return;
        }
        assert.deepEqual(
          set.items.filter((item) => item.role === "work").map((item) => item.title),
          ["Overdue drill", "Upcoming drill", "Undated drill"],
        );

        const personHit = await lookupGraphNodes(pool, {
          inputs: [{ name: "Fixture person", type: "person" }],
        });
        assert.equal(isToolError(personHit), false);
        if (isToolError(personHit)) {
          return;
        }
        const personId = personHit.results[0]?.candidates[0]?.id;
        const around = await workingSetGraph(pool, { id: personId! });
        assert.equal(isToolError(around), false);
        if (isToolError(around)) {
          return;
        }
        assert.equal(around.items.length, 2);
      });

      assert.ok(farTasks.length === 8);
      assert.ok(extraProjects.length === 42);
      assert.ok(suggestProject.id);
    } finally {
      await pool.end();
    }
  },
);
