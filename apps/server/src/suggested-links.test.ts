import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  ABOUT_SUGGESTION_REASON,
  CHILD_OF_SUGGESTION_REASON,
  isToolError,
} from "@foundation/schema";
import { getGraphNode, linkGraphNodes, upsertGraphNode } from "./graph.js";

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

async function edgeCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM edges");
  return Number(rows[0]?.n ?? 0);
}

test(
  "upsert suggests seed links from title FTS and never writes an edge",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("suggested_links");
    try {
      await t.test("empty vault / no title match → []", async () => {
        const first = await upsertGraphNode(pool, { type: "note", title: "Lonely capture" });
        assert.equal(isToolError(first), false);
        if (isToolError(first)) {
          return;
        }
        assert.deepEqual(first.suggested_links, []);
        assert.equal(await edgeCount(pool), 0);

        const miss = await upsertGraphNode(pool, {
          type: "task",
          title: "Unrelated zebra errand",
        });
        assert.equal(isToolError(miss), false);
        if (isToolError(miss)) {
          return;
        }
        assert.deepEqual(miss.suggested_links, []);
      });

      await t.test("task title matching a project is one child_of; no edge until link", async () => {
        const project = await upsertGraphNode(pool, {
          type: "project",
          title: "Kitchen remodel",
        });
        assert.equal(isToolError(project), false);
        if (isToolError(project)) {
          return;
        }
        assert.equal(
          project.suggested_links.some((item) => item.target.id === project.node.id),
          false,
        );

        const task = await upsertGraphNode(pool, {
          type: "task",
          title: "Kitchen remodel",
        });
        assert.equal(isToolError(task), false);
        if (isToolError(task)) {
          return;
        }
        assert.equal(task.suggested_links.length, 1);
        assert.deepEqual(task.suggested_links[0], {
          kind: "child_of",
          target: {
            id: project.node.id,
            type: "project",
            title: "Kitchen remodel",
          },
          reason: CHILD_OF_SUGGESTION_REASON,
        });
        assert.equal(task.suggested_links[0]?.target.id === task.node.id, false);
        assert.equal(await edgeCount(pool), 0);

        const fetched = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(fetched), false);
        if (isToolError(fetched)) {
          return;
        }
        assert.deepEqual(fetched.edges, []);
        assert.deepEqual(fetched.suggested_links, task.suggested_links);

        const linked = await linkGraphNodes(pool, {
          from_id: task.node.id,
          to_id: project.node.id,
          relation_type: "child_of",
          from_base_updated_at: task.node.updated_at,
          to_base_updated_at: project.node.updated_at,
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) {
          return;
        }
        assert.equal(await edgeCount(pool), 1);

        const afterLink = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(afterLink), false);
        if (isToolError(afterLink)) {
          return;
        }
        assert.equal(afterLink.edges.length, 1);
        assert.equal(
          afterLink.suggested_links.some((item) => item.target.id === project.node.id),
          false,
        );

        const renamed = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "task",
          title: "Kitchen remodel punch list",
          base_updated_at: afterLink.node.updated_at,
        });
        assert.equal(isToolError(renamed), false);
        if (isToolError(renamed)) {
          return;
        }
        assert.equal(
          renamed.suggested_links.some((item) => item.target.id === project.node.id),
          false,
        );
        assert.equal(await edgeCount(pool), 1);
      });

      await t.test("suggestions never include the node itself", async () => {
        const created = await upsertGraphNode(pool, {
          type: "idea",
          title: "Self reference decoy",
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) {
          return;
        }
        assert.equal(
          created.suggested_links.some((item) => item.target.id === created.node.id),
          false,
        );

        const again = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "idea",
          title: "Self reference decoy",
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(again), false);
        if (isToolError(again)) {
          return;
        }
        assert.equal(
          again.suggested_links.some((item) => item.target.id === created.node.id),
          false,
        );
      });

      await t.test("task already child_of A is not offered child_of B", async () => {
        const projectA = await upsertGraphNode(pool, {
          type: "project",
          title: "Garden shed",
        });
        const projectB = await upsertGraphNode(pool, {
          type: "project",
          title: "Bathroom remodel",
        });
        assert.equal(isToolError(projectA), false);
        assert.equal(isToolError(projectB), false);
        if (isToolError(projectA) || isToolError(projectB)) {
          return;
        }

        const task = await upsertGraphNode(pool, {
          type: "task",
          title: "Garden shed punch list",
        });
        assert.equal(isToolError(task), false);
        if (isToolError(task)) {
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: task.node.id,
          to_id: projectA.node.id,
          relation_type: "child_of",
          from_base_updated_at: task.node.updated_at,
          to_base_updated_at: projectA.node.updated_at,
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) {
          return;
        }

        const current = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(current), false);
        if (isToolError(current)) {
          return;
        }
        const renamed = await upsertGraphNode(pool, {
          id: task.node.id,
          type: "task",
          title: "Bathroom remodel",
          base_updated_at: current.node.updated_at,
        });
        assert.equal(isToolError(renamed), false);
        if (isToolError(renamed)) {
          return;
        }
        assert.equal(
          renamed.suggested_links.some((item) => item.kind === "child_of"),
          false,
        );
        assert.equal(
          renamed.suggested_links.some((item) => item.target.id === projectB.node.id && item.kind === "child_of"),
          false,
        );

        const fetched = await getGraphNode(pool, task.node.id);
        assert.equal(isToolError(fetched), false);
        if (isToolError(fetched)) {
          return;
        }
        assert.equal(
          fetched.suggested_links.some((item) => item.kind === "child_of"),
          false,
        );
        assert.ok(fetched.edges.some((edge) => edge.relation_type === "child_of"));
      });

      await t.test("title that looks like a person suggests about", async () => {
        const person = await upsertGraphNode(pool, {
          type: "person",
          title: "Jordan Lee",
        });
        assert.equal(isToolError(person), false);
        if (isToolError(person)) {
          return;
        }
        const note = await upsertGraphNode(pool, {
          type: "note",
          title: "Jordan Lee intro",
        });
        assert.equal(isToolError(note), false);
        if (isToolError(note)) {
          return;
        }
        assert.equal(note.suggested_links.length, 1);
        assert.deepEqual(note.suggested_links[0], {
          kind: "about",
          target: {
            id: person.node.id,
            type: "person",
            title: "Jordan Lee",
          },
          reason: ABOUT_SUGGESTION_REASON,
        });
        const fetched = await getGraphNode(pool, note.node.id);
        assert.equal(isToolError(fetched), false);
        if (isToolError(fetched)) {
          return;
        }
        assert.deepEqual(fetched.edges, []);
        assert.deepEqual(fetched.suggested_links, note.suggested_links);
      });
    } finally {
      await pool.end();
    }
  },
);
