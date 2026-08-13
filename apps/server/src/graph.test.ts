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
  await pool.query("UPDATE relation_types SET semantic_parent_slug = NULL WHERE is_system = false");
  await pool.query("DELETE FROM relation_types WHERE is_system = false");
  await pool.query("DELETE FROM node_types WHERE is_system = false");
  await seedSystemOntology(pool);
}

test(
  "nodes, edges, and ontology mutations (happy paths)",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("slice4_graph");
    try {
      await resetGraph(pool);

      await t.test("upsert + get round-trip HTML itinerary on a trip node", async () => {
        const html =
          "<!DOCTYPE html><html><body><h1>Kyoto</h1><ol><li>Fushimi Inari</li></ol></body></html>";
        const created = await upsertGraphNode(pool, {
          type: "trip",
          title: "Kyoto spring",
          payload: { media_type: "text/html", storage: "inline", body: html },
          data: { start: "2026-03-20" },
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;
        assert.match(created.node.id, /^[0-9a-f-]{36}$/);
        assert.equal(created.node.type, "trip");
        assert.equal(created.node.payload.media_type, "text/html");
        assert.equal(created.node.payload.body, html);

        const fetched = await getGraphNode(pool, created.node.id);
        assert.equal(isToolError(fetched), false);
        if (isToolError(fetched)) return;
        assert.equal(fetched.node.payload.body, html);
        assert.equal(fetched.node.data.start, "2026-03-20");
        assert.deepEqual(fetched.edges, []);
      });

      await t.test("inline markdown, json, and plain payloads round-trip", async () => {
        for (const payload of [
          { media_type: "text/markdown", storage: "inline" as const, body: "# Hello" },
          { media_type: "application/json", storage: "inline" as const, body: "{\"n\":1}" },
          { media_type: "text/plain", storage: "inline" as const, body: "just text" },
        ]) {
          const created = await upsertGraphNode(pool, {
            type: "note",
            title: payload.media_type,
            payload,
          });
          assert.equal(isToolError(created), false);
          if (isToolError(created)) return;
          const fetched = await getGraphNode(pool, created.node.id);
          assert.equal(isToolError(fetched), false);
          if (isToolError(fetched)) return;
          assert.equal(fetched.node.payload.media_type, payload.media_type);
          assert.equal(fetched.node.payload.body, payload.body);
        }
      });

      await t.test("delete requires confirm and soft-deletes", async () => {
        const created = await upsertGraphNode(pool, { type: "note", title: "scratch" });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const refused = await deleteGraphNode(pool, { id: created.node.id });
        assert.equal(isToolError(refused), true);
        if (!isToolError(refused)) return;
        assert.match(refused.error, /confirm: true/);

        const stillThere = await getGraphNode(pool, created.node.id);
        assert.equal(isToolError(stillThere), false);

        const deleted = await deleteGraphNode(pool, { id: created.node.id, confirm: true });
        assert.equal(isToolError(deleted), false);
        if (isToolError(deleted)) return;
        assert.equal(deleted.ok, true);

        const gone = await getGraphNode(pool, created.node.id);
        assert.equal(isToolError(gone), true);
      });

      await t.test("create area + project and link with child_of", async () => {
        const area = await upsertGraphNode(pool, { type: "area", title: "Health" });
        const project = await upsertGraphNode(pool, { type: "project", title: "Sleep well" });
        assert.equal(isToolError(area), false);
        assert.equal(isToolError(project), false);
        if (isToolError(area) || isToolError(project)) return;

        const linked = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) return;
        assert.equal(linked.edge.relation_type, "child_of");
        assert.equal(linked.edge.from_id, project.node.id);
        assert.equal(linked.edge.to_id, area.node.id);

        const got = await getGraphNode(pool, project.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) return;
        assert.equal(got.edges.length, 1);
        assert.equal(got.edges[0]?.relation_type, "child_of");
        assert.equal(got.edges[0]?.direction, "out");

        const second = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
        });
        assert.equal(isToolError(second), true);
        if (!isToolError(second)) return;
        assert.match(second.error, /already has a child_of parent|Duplicate edge/);
      });

      await t.test("soft-deleted parent does not block reparenting a child", async () => {
        const oldArea = await upsertGraphNode(pool, { type: "area", title: "Old home" });
        const newArea = await upsertGraphNode(pool, { type: "area", title: "New home" });
        const project = await upsertGraphNode(pool, { type: "project", title: "Move me" });
        if (isToolError(oldArea) || isToolError(newArea) || isToolError(project)) {
          assert.fail("upsert failed");
          return;
        }

        const linked = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: oldArea.node.id,
          relation_type: "child_of",
        });
        if (isToolError(linked)) {
          assert.fail(linked.error);
          return;
        }

        const deleted = await deleteGraphNode(pool, { id: oldArea.node.id, confirm: true });
        assert.equal(isToolError(deleted), false);

        const orphaned = await getGraphNode(pool, project.node.id);
        assert.equal(isToolError(orphaned), false);
        if (isToolError(orphaned)) return;
        assert.equal(orphaned.edges.length, 0);

        const reparented = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: newArea.node.id,
          relation_type: "child_of",
        });
        assert.equal(isToolError(reparented), false);
        if (isToolError(reparented)) return;
        assert.equal(reparented.edge.relation_type, "child_of");
        assert.equal(reparented.edge.to_id, newArea.node.id);

        const { rows: unlinks } = await pool.query<{
          action: string;
          target_kind: string;
          target_id: string;
          before: {
            id: string;
            from_id: string;
            to_id: string;
            relation_type: string;
          };
          after: unknown;
        }>(
          `SELECT action, target_kind, target_id, before, after
           FROM activity
           WHERE action = 'unlink' AND target_id = $1`,
          [linked.edge.id],
        );
        assert.equal(unlinks.length, 1);
        assert.equal(unlinks[0]?.target_kind, "edge");
        assert.equal(unlinks[0]?.before.id, linked.edge.id);
        assert.equal(unlinks[0]?.before.from_id, project.node.id);
        assert.equal(unlinks[0]?.before.to_id, oldArea.node.id);
        assert.equal(unlinks[0]?.before.relation_type, "child_of");
        assert.equal(unlinks[0]?.after, null);

        const got = await getGraphNode(pool, project.node.id);
        assert.equal(isToolError(got), false);
        if (isToolError(got)) return;
        assert.equal(got.edges.length, 1);
        assert.equal(got.edges[0]?.relation_type, "child_of");
        assert.equal(got.edges[0]?.to_id, newArea.node.id);
      });

      await t.test("relates_to does not silently rewrite to child_of", async () => {
        const area = await upsertGraphNode(pool, { type: "area", title: "Work" });
        const project = await upsertGraphNode(pool, { type: "project", title: "Ship v1" });
        if (isToolError(area) || isToolError(project)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "relates_to",
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) return;
        assert.equal(linked.edge.relation_type, "relates_to");
        assert.match(linked.suggestion ?? "", /child_of/);
      });

      await t.test("unlink requires confirm and removes the edge", async () => {
        const a = await upsertGraphNode(pool, { type: "note", title: "A" });
        const b = await upsertGraphNode(pool, { type: "idea", title: "B" });
        if (isToolError(a) || isToolError(b)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: a.node.id,
          to_id: b.node.id,
          relation_type: "inspired_by",
        });
        if (isToolError(linked)) {
          assert.fail(linked.error);
          return;
        }
        const refused = await unlinkGraphNodes(pool, {
          from_id: a.node.id,
          to_id: b.node.id,
          relation_type: "inspired_by",
        });
        assert.equal(isToolError(refused), true);

        const gone = await unlinkGraphNodes(pool, {
          from_id: a.node.id,
          to_id: b.node.id,
          relation_type: "inspired_by",
          confirm: true,
        });
        assert.equal(isToolError(gone), false);
        const fetched = await getGraphNode(pool, a.node.id);
        assert.equal(isToolError(fetched), false);
        if (isToolError(fetched)) return;
        assert.equal(fetched.edges.length, 0);
      });

      await t.test("manage_type adds a custom type; upsert uses it; system type is protected", async () => {
        const created = await manageType(pool, {
          action: "create",
          slug: "meeting",
          description: "A scheduled conversation",
          kind: "artifact",
          parent_types: ["project"],
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;
        assert.equal(created.type.slug, "meeting");
        assert.equal(created.type.is_system, false);
        assert.deepEqual(created.type.parent_types, ["project"]);

        const ontology = await inspectOntology(pool);
        assert.ok(ontology.types.some((type) => type.slug === "meeting"));

        const node = await upsertGraphNode(pool, {
          type: "meeting",
          title: "Kickoff",
          payload: { media_type: "text/markdown", storage: "inline", body: "agenda" },
        });
        assert.equal(isToolError(node), false);
        if (isToolError(node)) return;
        assert.equal(node.node.type, "meeting");

        const project = await upsertGraphNode(pool, { type: "project", title: "Launch" });
        if (isToolError(project)) {
          assert.fail(project.error);
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: node.node.id,
          to_id: project.node.id,
          relation_type: "child_of",
        });
        assert.equal(isToolError(linked), false);
        if (isToolError(linked)) return;
        assert.equal(linked.edge.relation_type, "child_of");

        const blocked = await manageType(pool, {
          action: "update",
          slug: "area",
          kind: "artifact",
        });
        assert.equal(isToolError(blocked), true);
        if (!isToolError(blocked)) return;
        assert.match(blocked.error, /system type "area"/);

        const described = await manageType(pool, {
          action: "update",
          slug: "area",
          description: "Vault root — updated by an agent",
        });
        assert.equal(isToolError(described), false);
        if (isToolError(described)) return;
        assert.equal(described.type.description, "Vault root — updated by an agent");
        assert.equal(described.type.kind, "spine");

        await seedSystemOntology(pool);
        const still = await inspectOntology(pool, "types");
        assert.equal(
          still.types.find((type) => type.slug === "area")?.description,
          "Vault root — updated by an agent",
        );
      });

      await t.test("manage_relation creates an associative verb immediately", async () => {
        const created = await manageRelation(pool, {
          action: "create",
          slug: "blocked_by",
          description: "Source is blocked by target",
          kind: "associative",
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;
        assert.equal(created.relation.is_system, false);

        const a = await upsertGraphNode(pool, { type: "task", title: "A" });
        const b = await upsertGraphNode(pool, { type: "task", title: "B" });
        if (isToolError(a) || isToolError(b)) {
          assert.fail("upsert failed");
          return;
        }
        const linked = await linkGraphNodes(pool, {
          from_id: a.node.id,
          to_id: b.node.id,
          relation_type: "blocked_by",
        });
        assert.equal(isToolError(linked), false);
      });
    } finally {
      await pool.end();
    }
  },
);
