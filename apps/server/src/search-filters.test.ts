import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import {
  LINK_HIT_SUGGESTION,
  LINK_MISS_SUGGESTION,
  SEARCH_NO_SELECTOR_SUGGESTION,
  isToolError,
} from "@foundation/schema";
import {
  inspectOntology,
  linkGraphNodes,
  manageType,
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
  "search listing, link uniqueness, schema miss, company/decision seeds",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("search_filters_link");
    try {
      const ontology = await inspectOntology(pool, "types");
      const slugs = ontology.types.map((type) => type.slug);
      assert.ok(slugs.includes("place"));
      assert.ok(slugs.includes("company"));
      assert.ok(slugs.includes("decision"));
      assert.ok(slugs.includes("spend"));
      assert.equal(ontology.types.find((type) => type.slug === "place")?.is_system, true);
      assert.equal(ontology.types.find((type) => type.slug === "company")?.is_system, true);
      assert.equal(ontology.types.find((type) => type.slug === "decision")?.is_system, true);

      const company = await upsertGraphNode(pool, {
        type: "company",
        title: "Throwaway Fixture Co",
      });
      assert.equal(isToolError(company), false);
      if (isToolError(company)) {
        return;
      }

      const decision = await upsertGraphNode(pool, {
        type: "decision",
        title: "Throwaway fixture decision",
      });
      assert.equal(isToolError(decision), false);
      if (isToolError(decision)) {
        return;
      }

      const openTask = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway open task",
        status: "active",
      });
      const doneTask = await upsertGraphNode(pool, {
        type: "task",
        title: "Throwaway done task",
        status: "completed",
      });
      const decoyNote = await upsertGraphNode(pool, {
        type: "note",
        title: "Throwaway note not a task",
      });
      assert.equal(isToolError(openTask), false);
      assert.equal(isToolError(doneTask), false);
      assert.equal(isToolError(decoyNote), false);
      if (isToolError(openTask) || isToolError(doneTask) || isToolError(decoyNote)) {
        return;
      }

      await t.test("list-by-type with no query", async () => {
        const none = await searchGraphNodes(pool, {});
        assert.equal(isToolError(none), true);
        if (!isToolError(none)) {
          return;
        }
        assert.match(none.error, /query or a filter/);
        assert.equal(none.suggestion, SEARCH_NO_SELECTOR_SUGGESTION);

        const people = await searchGraphNodes(pool, { type: "person" });
        assert.equal(isToolError(people), false);
        if (isToolError(people)) {
          return;
        }
        assert.deepEqual(people.nodes, []);
        assert.equal(people.suggestion, undefined);

        const companies = await searchGraphNodes(pool, { type: "company" });
        assert.equal(isToolError(companies), false);
        if (isToolError(companies)) {
          return;
        }
        assert.ok(companies.nodes.some((node) => node.id === company.node.id));
        assert.ok(companies.nodes.every((node) => node.type === "company"));

        const tasks = await searchGraphNodes(pool, { type: "task" });
        assert.equal(isToolError(tasks), false);
        if (isToolError(tasks)) {
          return;
        }
        assert.ok(tasks.nodes.some((node) => node.id === openTask.node.id));
        assert.ok(tasks.nodes.some((node) => node.id === doneTask.node.id));
        assert.equal(
          tasks.nodes.some((node) => node.id === decoyNote.node.id),
          false,
        );
      });

      await t.test("status, under, and since filters without a query", async () => {
        const open = await searchGraphNodes(pool, { type: "task", status: "active" });
        assert.equal(isToolError(open), false);
        if (isToolError(open)) {
          return;
        }
        assert.ok(open.nodes.some((node) => node.id === openTask.node.id));
        assert.equal(
          open.nodes.some((node) => node.id === doneTask.node.id),
          false,
        );

        const area = await upsertGraphNode(pool, { type: "area", title: "Throwaway area" });
        const project = await upsertGraphNode(pool, { type: "project", title: "Throwaway project" });
        assert.equal(isToolError(area), false);
        assert.equal(isToolError(project), false);
        if (isToolError(area) || isToolError(project)) {
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: area.node.updated_at,
        });
        assert.equal(isToolError(linked), false);

        const children = await searchGraphNodes(pool, { under: area.node.id });
        assert.equal(isToolError(children), false);
        if (isToolError(children)) {
          return;
        }
        assert.equal(children.nodes.length, 1);
        assert.equal(children.nodes[0]?.id, project.node.id);

        const future = await searchGraphNodes(pool, {
          type: "task",
          since: "2099-01-01T00:00:00Z",
        });
        assert.equal(isToolError(future), false);
        if (isToolError(future)) {
          return;
        }
        assert.deepEqual(future.nodes, []);
      });

      await t.test("link uniqueness and lookup", async () => {
        const person = await upsertGraphNode(pool, {
          type: "person",
          title: "Throwaway link person",
          data: { link: { system: "gmail", id: "msg-fixture-1" } },
        });
        assert.equal(isToolError(person), false);
        if (isToolError(person)) {
          return;
        }

        const twin = await upsertGraphNode(pool, {
          type: "person",
          title: "Throwaway twin person",
          data: { link: { system: "gmail", id: "msg-fixture-1" } },
        });
        assert.equal(isToolError(twin), true);
        if (!isToolError(twin)) {
          return;
        }
        assert.match(twin.error, /gmail:msg-fixture-1/);
        assert.match(twin.error, new RegExp(person.node.id));
        assert.match(twin.suggestion ?? "", /do not create a twin/i);

        const hit = await searchGraphNodes(pool, {
          link: { system: "gmail", id: "msg-fixture-1" },
        });
        assert.equal(isToolError(hit), false);
        if (isToolError(hit)) {
          return;
        }
        assert.equal(hit.nodes.length, 1);
        assert.equal(hit.nodes[0]?.id, person.node.id);
        assert.equal(hit.suggestion, LINK_HIT_SUGGESTION);

        const miss = await searchGraphNodes(pool, {
          link: { system: "drive", id: "no-such-ref" },
        });
        assert.equal(isToolError(miss), false);
        if (isToolError(miss)) {
          return;
        }
        assert.deepEqual(miss.nodes, []);
        assert.equal(miss.suggestion, LINK_MISS_SUGGESTION);

        const badSystem = await upsertGraphNode(pool, {
          type: "person",
          title: "Throwaway slack link",
          data: { link: { system: "slack", id: "x" } },
        });
        assert.equal(isToolError(badSystem), true);
        if (isToolError(badSystem)) {
          assert.match(badSystem.error, /Unknown link.system/);
          assert.match(badSystem.suggestion ?? "", /do not fetch or mirror/i);
        }

        const padded = await upsertGraphNode(pool, {
          type: "person",
          title: "Throwaway padded link",
          data: { link: { system: "calendar", id: "  evt-fixture-1  " } },
        });
        assert.equal(isToolError(padded), false);
        if (isToolError(padded)) {
          return;
        }
        assert.deepEqual(padded.node.data.link, { system: "calendar", id: "evt-fixture-1" });
        const paddedHit = await searchGraphNodes(pool, {
          link: { system: "calendar", id: "evt-fixture-1" },
        });
        assert.equal(isToolError(paddedHit), false);
        if (!isToolError(paddedHit)) {
          assert.ok(paddedHit.nodes.some((node) => node.id === padded.node.id));
        }

        const keyed = await upsertGraphNode(pool, {
          type: "person",
          title: "Throwaway keyed link",
          data: { link: { system: "drive", id: "file-fixture-1" } },
          idempotency_key: "link-idem-fixture",
        });
        assert.equal(isToolError(keyed), false);
        if (isToolError(keyed)) {
          return;
        }
        const retry = await upsertGraphNode(pool, {
          type: "person",
          title: "Throwaway keyed link retry",
          data: { link: { system: "drive", id: "file-fixture-1" } },
          idempotency_key: "link-idem-fixture",
        });
        assert.equal(isToolError(retry), false);
        if (!isToolError(retry)) {
          assert.equal(retry.node.id, keyed.node.id);
        }
      });

      await t.test("schema miss on upsert returns error and suggestion", async () => {
        const typed = await manageType(pool, {
          action: "create",
          slug: "labeled_fixture",
          description: "Throwaway type with a required name field",
          kind: "artifact",
          json_schema: {
            type: "object",
            additionalProperties: true,
            required: ["name"],
            properties: { name: { type: "string", minLength: 1 } },
          },
        });
        assert.equal(isToolError(typed), false);
        if (isToolError(typed)) {
          return;
        }

        const miss = await upsertGraphNode(pool, {
          type: "labeled_fixture",
          title: "Throwaway schema miss",
          data: { other: 1 },
        });
        assert.equal(isToolError(miss), true);
        if (!isToolError(miss)) {
          return;
        }
        assert.match(miss.error, /does not match json_schema for type "labeled_fixture"/);
        assert.match(miss.suggestion ?? "", /inspect_ontology/);

        const ok = await upsertGraphNode(pool, {
          type: "labeled_fixture",
          title: "Throwaway schema hit",
          data: { name: "ok" },
        });
        assert.equal(isToolError(ok), false);
      });
    } finally {
      await pool.end();
    }
  },
);
