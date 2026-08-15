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
  "task may child_of project or goal; not area",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("spine_task_parent");
    try {
      const ontology = await inspectOntology(pool, "types");
      const taskType = ontology.types.find((type) => type.slug === "task");
      assert.deepEqual(taskType?.parent_types, ["goal", "project"]);
      assert.match(taskType?.description ?? "", /Prefer child_of a goal/);
      assert.match(taskType?.description ?? "", /child_of a project is allowed/);

      const area = await upsertGraphNode(pool, { type: "area", title: "Throwaway area" });
      const project = await upsertGraphNode(pool, { type: "project", title: "Throwaway project" });
      const goal = await upsertGraphNode(pool, { type: "goal", title: "Throwaway goal" });
      const underProject = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway task under project",
      });
      const underGoal = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway task under goal",
      });
      const underArea = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway task under area",
      });
      assert.equal(isToolError(area), false);
      assert.equal(isToolError(project), false);
      assert.equal(isToolError(goal), false);
      assert.equal(isToolError(underProject), false);
      assert.equal(isToolError(underGoal), false);
      assert.equal(isToolError(underArea), false);
      if (
        isToolError(area) ||
        isToolError(project) ||
        isToolError(goal) ||
        isToolError(underProject) ||
        isToolError(underGoal) ||
        isToolError(underArea)
      ) {
        return;
      }

      const toProject = await linkGraphNodes(pool, {
        from_id: underProject.node.id,
        to_id: project.node.id,
        relation_type: "child_of",
        from_base_updated_at: underProject.node.updated_at,
        to_base_updated_at: project.node.updated_at,
      });
      assert.equal(isToolError(toProject), false);
      if (!isToolError(toProject)) {
        assert.equal(toProject.edge.relation_type, "child_of");
        assert.equal(toProject.edge.to_id, project.node.id);
      }

      const toGoal = await linkGraphNodes(pool, {
        from_id: underGoal.node.id,
        to_id: goal.node.id,
        relation_type: "child_of",
        from_base_updated_at: underGoal.node.updated_at,
        to_base_updated_at: goal.node.updated_at,
      });
      assert.equal(isToolError(toGoal), false);
      if (!isToolError(toGoal)) {
        assert.equal(toGoal.edge.relation_type, "child_of");
        assert.equal(toGoal.edge.to_id, goal.node.id);
      }

      const toArea = await linkGraphNodes(pool, {
        from_id: underArea.node.id,
        to_id: area.node.id,
        relation_type: "child_of",
        from_base_updated_at: underArea.node.updated_at,
        to_base_updated_at: area.node.updated_at,
      });
      assert.equal(isToolError(toArea), true);
      if (isToolError(toArea)) {
        assert.match(toArea.error, /cannot be child_of/);
        assert.match(toArea.suggestion ?? "", /goal/);
        assert.match(toArea.suggestion ?? "", /project/);
      }
    } finally {
      await pool.end();
    }
  },
);
