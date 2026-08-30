import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { inspectOntology, linkGraphNodes, upsertGraphNode } from "./graph.js";

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
  "habit without a goal parent is accepted; task still cannot child_of area",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("spine_habit_parent");
    try {
      const ontology = await inspectOntology(pool, "types");
      const habitType = ontology.types.find((type) => type.slug === "habit");
      const lessonType = ontology.types.find((type) => type.slug === "lesson");
      assert.deepEqual(habitType?.parent_types, ["goal"]);
      assert.match(habitType?.description ?? "", /does not need a goal parent/);
      assert.match(lessonType?.description ?? "", /does not need that parent/);

      const habit = await upsertGraphNode(pool, {
        type: "habit",
        title: "Throwaway habit with no parent",
      });
      assert.equal(isToolError(habit), false);
      if (isToolError(habit)) {
        return;
      }
      assert.equal(habit.node.type, "habit");
      assert.equal(habit.node.title, "Throwaway habit with no parent");

      const lesson = await upsertGraphNode(pool, {
        type: "lesson",
        title: "Throwaway lesson with no parent",
      });
      assert.equal(isToolError(lesson), false);
      if (isToolError(lesson)) {
        return;
      }
      assert.equal(lesson.node.type, "lesson");

      const spend = await upsertGraphNode(pool, {
        type: "spend",
        title: "Throwaway spend with no parent",
        data: {
          amount: 12.5,
          currency: "USD",
          vendor: "Fixture vendor",
          stage: "quoted",
        },
      });
      assert.equal(isToolError(spend), false);
      if (isToolError(spend)) {
        return;
      }
      assert.equal(spend.node.type, "spend");

      const area = await upsertGraphNode(pool, { type: "area", title: "Throwaway area" });
      const goal = await upsertGraphNode(pool, { type: "goal", title: "Throwaway goal" });
      const underGoal = await upsertGraphNode(pool, {
        type: "habit",
        title: "Throwaway habit under goal",
      });
      const underArea = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway task under area",
      });
      assert.equal(isToolError(area), false);
      assert.equal(isToolError(goal), false);
      assert.equal(isToolError(underGoal), false);
      assert.equal(isToolError(underArea), false);
      if (
        isToolError(area) ||
        isToolError(goal) ||
        isToolError(underGoal) ||
        isToolError(underArea)
      ) {
        return;
      }

      const habitToGoal = await linkGraphNodes(pool, {
        from_id: underGoal.node.id,
        to_id: goal.node.id,
        relation_type: "child_of",
        from_base_updated_at: underGoal.node.updated_at,
        to_base_updated_at: goal.node.updated_at,
      });
      assert.equal(isToolError(habitToGoal), false);
      if (!isToolError(habitToGoal)) {
        assert.equal(habitToGoal.edge.relation_type, "child_of");
        assert.equal(habitToGoal.edge.to_id, goal.node.id);
      }

      const habitRelates = await linkGraphNodes(pool, {
        from_id: habit.node.id,
        to_id: area.node.id,
        relation_type: "relates_to",
        from_base_updated_at: habit.node.updated_at,
        to_base_updated_at: area.node.updated_at,
      });
      assert.equal(isToolError(habitRelates), false);

      const taskToArea = await linkGraphNodes(pool, {
        from_id: underArea.node.id,
        to_id: area.node.id,
        relation_type: "child_of",
        from_base_updated_at: underArea.node.updated_at,
        to_base_updated_at: area.node.updated_at,
      });
      assert.equal(isToolError(taskToArea), true);
      if (isToolError(taskToArea)) {
        assert.match(taskToArea.error, /cannot be child_of/);
        assert.match(taskToArea.suggestion ?? "", /goal/);
        assert.match(taskToArea.suggestion ?? "", /project/);
      }
    } finally {
      await pool.end();
    }
  },
);
