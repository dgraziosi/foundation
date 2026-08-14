import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError, todayInNewYork } from "@foundation/schema";
import { getGraphNode, inspectOntology, searchGraphNodes, upsertGraphNode } from "./graph.js";

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
  "due schema is optional; search filters overdue / today / window",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_due");
    try {
      const ontology = await inspectOntology(pool, "types");
      const taskType = ontology.types.find((type) => type.slug === "task");
      const goalType = ontology.types.find((type) => type.slug === "goal");
      const dueProps = taskType?.json_schema as { properties?: { due?: unknown } } | null;
      assert.ok(dueProps?.properties?.due);
      assert.deepEqual(taskType?.json_schema, goalType?.json_schema);

      const undated = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway undated task",
        status: "active",
      });
      assert.equal(isToolError(undated), false);
      if (isToolError(undated)) {
        return;
      }
      assert.equal(undated.node.data.due, undefined);

      const badStamp = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway timestamp due",
        data: { due: "2026-08-27T00:00:00Z" },
      });
      assert.equal(isToolError(badStamp), true);
      if (isToolError(badStamp)) {
        assert.match(badStamp.error, /data.due must be an ISO date|does not match json_schema/);
      }

      const badWords = await upsertGraphNode(pool, {
        type: "goal",
        title: "Throwaway wordy due",
        data: { due: "August 27" },
      });
      assert.equal(isToolError(badWords), true);

      const feb31 = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway impossible due",
        data: { due: "2026-02-31" },
      });
      assert.equal(isToolError(feb31), true);
      if (isToolError(feb31)) {
        assert.match(feb31.error, /data.due must be an ISO date/);
      }

      const today = todayInNewYork();
      const overdue = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway overdue task",
        status: "active",
        data: { due: "2020-01-01" },
      });
      const dueToday = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway due-today task",
        status: "active",
        data: { due: today },
      });
      const windowTask = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway window task",
        status: "active",
        data: { due: "2026-08-27" },
      });
      const futureGoal = await upsertGraphNode(pool, {
        type: "goal",
        title: "Throwaway future goal",
        data: { due: "2026-12-31" },
      });
      const toClear = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway clearable due",
        status: "active",
        data: { due: "2020-02-02" },
      });
      assert.equal(isToolError(overdue), false);
      assert.equal(isToolError(dueToday), false);
      assert.equal(isToolError(windowTask), false);
      assert.equal(isToolError(futureGoal), false);
      assert.equal(isToolError(toClear), false);
      if (
        isToolError(overdue) ||
        isToolError(dueToday) ||
        isToolError(windowTask) ||
        isToolError(futureGoal) ||
        isToolError(toClear)
      ) {
        return;
      }

      await t.test("get surfaces data.due; search hits include due", async () => {
        const got = await getGraphNode(pool, windowTask.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) {
          return;
        }
        assert.equal(got.node.data.due, "2026-08-27");

        const listed = await searchGraphNodes(pool, { type: "task" });
        assert.equal(isToolError(listed), false);
        if (isToolError(listed)) {
          return;
        }
        const hit = listed.nodes.find((node) => node.id === windowTask.node.id);
        assert.equal(hit?.due, "2026-08-27");
        const undatedHit = listed.nodes.find((node) => node.id === undated.node.id);
        assert.equal(undatedHit?.due, undefined);
      });

      await t.test("overdue and today use America/New_York; undated is excluded", async () => {
        const late = await searchGraphNodes(pool, { type: "task", due: "overdue" });
        assert.equal(isToolError(late), false);
        if (isToolError(late)) {
          return;
        }
        assert.ok(late.nodes.some((node) => node.id === overdue.node.id));
        assert.equal(
          late.nodes.some((node) => node.id === dueToday.node.id),
          false,
        );
        assert.equal(
          late.nodes.some((node) => node.id === undated.node.id),
          false,
        );
        assert.ok(late.nodes.every((node) => node.due && node.due < today));

        const now = await searchGraphNodes(pool, { type: "task", due: "today" });
        assert.equal(isToolError(now), false);
        if (isToolError(now)) {
          return;
        }
        assert.ok(now.nodes.some((node) => node.id === dueToday.node.id));
        assert.equal(now.nodes.some((node) => node.id === overdue.node.id), false);
        assert.ok(now.nodes.every((node) => node.due === today));
      });

      await t.test("due-on-or-before / due-on-or-after window", async () => {
        const byAug27 = await searchGraphNodes(pool, {
          type: "task",
          due_on_or_before: "2026-08-27",
        });
        assert.equal(isToolError(byAug27), false);
        if (isToolError(byAug27)) {
          return;
        }
        assert.ok(byAug27.nodes.some((node) => node.id === windowTask.node.id));
        assert.ok(byAug27.nodes.some((node) => node.id === overdue.node.id));
        assert.equal(
          byAug27.nodes.some((node) => node.id === undated.node.id),
          false,
        );

        const onAug27 = await searchGraphNodes(pool, {
          type: "task",
          due_on_or_after: "2026-08-27",
          due_on_or_before: "2026-08-27",
        });
        assert.equal(isToolError(onAug27), false);
        if (isToolError(onAug27)) {
          return;
        }
        assert.ok(onAug27.nodes.some((node) => node.id === windowTask.node.id));
        assert.ok(onAug27.nodes.every((node) => node.due === "2026-08-27"));
        assert.equal(
          onAug27.nodes.some((node) => node.id === undated.node.id),
          false,
        );

        const goals = await searchGraphNodes(pool, {
          type: "goal",
          due_on_or_after: "2026-08-27",
        });
        assert.equal(isToolError(goals), false);
        if (isToolError(goals)) {
          return;
        }
        assert.ok(goals.nodes.some((node) => node.id === futureGoal.node.id));
      });

      await t.test("due: null clears a date so overdue no longer matches", async () => {
        const cleared = await upsertGraphNode(pool, {
          id: toClear.node.id,
          type: "task",
          title: toClear.node.title,
          data: { due: null },
          base_updated_at: toClear.node.updated_at,
        });
        assert.equal(isToolError(cleared), false);
        if (isToolError(cleared)) {
          return;
        }
        assert.equal(cleared.node.data.due, undefined);

        const got = await getGraphNode(pool, toClear.node.id);
        assert.equal(isToolError(got), false);
        if (!isToolError(got)) {
          assert.equal(got.node.data.due, undefined);
        }

        const late = await searchGraphNodes(pool, { type: "task", due: "overdue" });
        assert.equal(isToolError(late), false);
        if (!isToolError(late)) {
          assert.equal(
            late.nodes.some((node) => node.id === toClear.node.id),
            false,
          );
        }
      });

      await t.test("junk data.due does not 500 search", async () => {
        await pool.query(
          `INSERT INTO nodes (type, title, status, payload, data)
           VALUES (
             'note',
             'Throwaway junk due note',
             'active',
             '{"media_type":"text/plain","storage":"inline","body":""}'::jsonb,
             '{"due":"2026-13-01"}'::jsonb
           )`,
        );
        const listed = await searchGraphNodes(pool, { type: "note", due: "overdue" });
        assert.equal(isToolError(listed), false);
        if (!isToolError(listed)) {
          assert.ok(listed.nodes.every((node) => node.due !== "2026-13-01"));
        }
      });

      await t.test("inverted due window is an error; due alone is a selector", async () => {
        const inverted = await searchGraphNodes(pool, {
          due_on_or_after: "2026-08-27",
          due_on_or_before: "2026-08-01",
        });
        assert.equal(isToolError(inverted), true);
        if (isToolError(inverted)) {
          assert.match(inverted.error, /due_on_or_after is after due_on_or_before/);
        }

        const overdueOnly = await searchGraphNodes(pool, { due: "overdue" });
        assert.equal(isToolError(overdueOnly), false);
        if (!isToolError(overdueOnly)) {
          assert.ok(overdueOnly.nodes.some((node) => node.id === overdue.node.id));
        }
      });
    } finally {
      await pool.end();
    }
  },
);
