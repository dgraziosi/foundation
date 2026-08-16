import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  SEARCH_MISS_SUGGESTION,
  SEARCH_UUID_SUGGESTION,
  isToolError,
} from "@foundation/schema";
import {
  getGraphNode,
  linkGraphNodes,
  searchGraphNodes,
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
  "search/get quality: paraphrases, data+HTML attrs, neighbor titles, miss is not upsert",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_get_quality");
    try {
      const person = await upsertGraphNode(pool, {
        type: "person",
        title: "Jordan Lee",
        payload: {
          media_type: "text/html",
          storage: "inline",
          body: '<p>Weekend note.</p><img alt="café terrace in the park" src="photo.jpg">',
        },
        data: { nickname: "Ada", note: "café" },
      });
      assert.equal(isToolError(person), false);
      if (isToolError(person)) {
        return;
      }

      const project = await upsertGraphNode(pool, {
        type: "project",
        title: "Cabin kitchen",
      });
      assert.equal(isToolError(project), false);
      if (isToolError(project)) {
        return;
      }

      const linked = await linkGraphNodes(pool, {
        from_id: project.node.id,
        to_id: person.node.id,
        relation_type: "about",
        from_base_updated_at: project.node.updated_at,
        to_base_updated_at: person.node.updated_at,
      });
      assert.equal(isToolError(linked), false);

      const decoy = await upsertGraphNode(pool, {
        type: "note",
        title: "Unrelated wrapper",
        payload: {
          media_type: "application/json",
          storage: "inline",
          body: '{"city":"Osaka","days":3}',
        },
      });
      assert.equal(isToolError(decoy), false);
      if (isToolError(decoy)) {
        return;
      }

      const htmlScripts = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway html script sandwich",
        payload: {
          media_type: "text/html",
          storage: "inline",
          body: '<html><head><script>var HEADTOKEN="drop-me";</script></head><body><p>visible meadow report</p></body><script>var FOOTTOKEN="drop-me-too";</script></html>',
        },
      });
      assert.equal(isToolError(htmlScripts), false);
      if (isToolError(htmlScripts)) {
        return;
      }

      await t.test("paraphrase Ada hits data, not an echoed full title", async () => {
        const hits = await searchGraphNodes(pool, { query: "Ada", type: "person" });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.ok(hits.nodes.some((node) => node.id === person.node.id));
        assert.ok(hits.nodes.every((node) => node.type === "person"));
        assert.equal(
          hits.nodes.some((node) => node.title === "Ada"),
          false,
        );
      });

      await t.test("café hits data and HTML alt text", async () => {
        const hits = await searchGraphNodes(pool, { query: "café" });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.ok(hits.nodes.some((node) => node.id === person.node.id));
      });

      await t.test("get returns neighbor titles, not UUID-only edges", async () => {
        const gotPerson = await getGraphNode(pool, person.node.id);
        assert.equal(isToolError(gotPerson), false);
        if (isToolError(gotPerson)) {
          return;
        }
        const about = gotPerson.edges.find((edge) => edge.relation_type === "about");
        assert.ok(about);
        assert.equal(about?.neighbor.title, "Cabin kitchen");
        assert.equal(about?.neighbor.type, "project");
        assert.equal(about?.neighbor.id, project.node.id);

        const gotProject = await getGraphNode(pool, project.node.id);
        assert.equal(isToolError(gotProject), false);
        if (isToolError(gotProject)) {
          return;
        }
        assert.equal(gotProject.edges[0]?.neighbor.title, "Jordan Lee");
        assert.equal(gotProject.edges[0]?.neighbor.type, "person");
      });

      await t.test("neighbor title from get is usable as a search token", async () => {
        const hits = await searchGraphNodes(pool, { query: "kitchen", type: "project" });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.ok(hits.nodes.some((node) => node.id === project.node.id));
        assert.ok(hits.nodes.every((node) => node.type === "project"));
      });

      await t.test("HTML with scripts in head and footer still indexes body text between them", async () => {
        const bodyHits = await searchGraphNodes(pool, { query: "meadow" });
        assert.equal(isToolError(bodyHits), false);
        if (isToolError(bodyHits)) {
          return;
        }
        assert.ok(bodyHits.nodes.some((node) => node.id === htmlScripts.node.id));

        const headHits = await searchGraphNodes(pool, { query: "HEADTOKEN" });
        assert.equal(isToolError(headHits), false);
        if (isToolError(headHits)) {
          return;
        }
        assert.equal(
          headHits.nodes.some((node) => node.id === htmlScripts.node.id),
          false,
        );

        const footHits = await searchGraphNodes(pool, { query: "FOOTTOKEN" });
        assert.equal(isToolError(footHits), false);
        if (isToolError(footHits)) {
          return;
        }
        assert.equal(
          footHits.nodes.some((node) => node.id === htmlScripts.node.id),
          false,
        );
      });

      await t.test("JSON body values are indexed; payload wrapper keys are not", async () => {
        const osaka = await searchGraphNodes(pool, { query: "Osaka" });
        assert.equal(isToolError(osaka), false);
        if (isToolError(osaka)) {
          return;
        }
        assert.ok(osaka.nodes.some((node) => node.id === decoy.node.id));

        const wrapper = await searchGraphNodes(pool, { query: "media_type" });
        assert.equal(isToolError(wrapper), false);
        if (isToolError(wrapper)) {
          return;
        }
        assert.equal(
          wrapper.nodes.some((node) => node.id === decoy.node.id),
          false,
        );
      });

      await t.test("UUID query resolves via get-path and tells the agent to prefer get", async () => {
        const hits = await searchGraphNodes(pool, { query: person.node.id });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.equal(hits.nodes.length, 1);
        assert.equal(hits.nodes[0]?.id, person.node.id);
        assert.equal(hits.suggestion, SEARCH_UUID_SUGGESTION);
      });

      await t.test("FTS miss suggests not upserting a duplicate", async () => {
        const hits = await searchGraphNodes(pool, { query: "no-such-token-xyz" });
        assert.equal(isToolError(hits), false);
        if (isToolError(hits)) {
          return;
        }
        assert.deepEqual(hits.nodes, []);
        assert.equal(hits.suggestion, SEARCH_MISS_SUGGESTION);
        assert.match(hits.suggestion ?? "", /do not upsert a duplicate/i);
      });
    } finally {
      await pool.end();
    }
  },
);
