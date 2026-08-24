import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError, viewIds } from "@foundation/schema";
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
    const pool = await poolForSchema("graph_nodes");
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

      await t.test("update without payload preserves the stored body", async () => {
        const created = await upsertGraphNode(pool, {
          type: "note",
          title: "Keep body",
          payload: { media_type: "text/markdown", storage: "inline", body: "# Keep me" },
          data: { source: "agent" },
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const updated = await upsertGraphNode(pool, {
          id: created.node.id,
          type: "note",
          title: "Renamed",
          status: "active",
          base_updated_at: created.node.updated_at,
        });
        assert.equal(isToolError(updated), false);
        if (isToolError(updated)) return;
        assert.equal(updated.node.title, "Renamed");
        assert.equal(updated.node.payload.media_type, "text/markdown");
        assert.equal(updated.node.payload.storage, "inline");
        assert.equal(updated.node.payload.body, "# Keep me");
        assert.equal(updated.node.data.source, "agent");
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
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: area.node.updated_at,
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
        assert.equal(got.edges[0]?.neighbor.title, "Health");
        assert.equal(got.edges[0]?.neighbor.type, "area");
        assert.equal(got.edges[0]?.neighbor.id, area.node.id);

        const second = await linkGraphNodes(pool, {
          from_id: project.node.id,
          to_id: area.node.id,
          relation_type: "child_of",
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: area.node.updated_at,
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
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: oldArea.node.updated_at,
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
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: newArea.node.updated_at,
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
          from_base_updated_at: project.node.updated_at,
          to_base_updated_at: area.node.updated_at,
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
          from_base_updated_at: a.node.updated_at,
          to_base_updated_at: b.node.updated_at,
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
          hue: "sky",
          glyph: "Tag",
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;
        assert.equal(created.type.slug, "meeting");
        assert.equal(created.type.is_system, false);
        assert.equal(created.type.hue, "sky");
        assert.equal(created.type.glyph, "Tag");
        assert.deepEqual(created.type.parent_types, ["project"]);
        assert.deepEqual(viewIds(created.type.views), []);
        assert.equal(created.type.default_view, undefined);

        const withViews = await manageType(pool, {
          action: "create",
          slug: "brief",
          kind: "artifact",
          views: ["card", "list"],
          default_view: "card",
        });
        assert.equal(isToolError(withViews), false);
        if (isToolError(withViews)) return;
        assert.deepEqual(viewIds(withViews.type.views), ["card", "list"]);
        assert.equal(withViews.type.default_view, "card");

        const ontology = await inspectOntology(pool);
        const brief = ontology.types.find((type) => type.slug === "brief");
        assert.deepEqual(viewIds(brief?.views), ["card", "list"]);
        assert.equal(brief?.default_view, "card");
        const meeting = ontology.types.find((type) => type.slug === "meeting");
        assert.equal(meeting?.hue, "sky");
        assert.equal(meeting?.glyph, "Tag");
        const task = ontology.types.find((type) => type.slug === "task");
        assert.deepEqual(viewIds(task?.views), ["board", "list", "calendar", "timeline", "outline"]);
        assert.equal(task?.default_view, "board");
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
          from_base_updated_at: node.node.updated_at,
          to_base_updated_at: project.node.updated_at,
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
          description: "Spine root — updated by an agent",
        });
        assert.equal(isToolError(described), false);
        if (isToolError(described)) return;
        assert.equal(described.type.description, "Spine root — updated by an agent");
        assert.equal(described.type.kind, "spine");

        await seedSystemOntology(pool);
        const still = await inspectOntology(pool, "types");
        assert.equal(
          still.types.find((type) => type.slug === "area")?.description,
          "Spine root — updated by an agent",
        );
      });

      await t.test("manage_type update resolves default against views being written", async () => {
        const created = await manageType(pool, {
          action: "create",
          slug: "dossier",
          kind: "artifact",
          views: ["board", "list"],
          default_view: "board",
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const dropped = await manageType(pool, {
          action: "update",
          slug: "dossier",
          views: ["list", "outline"],
        });
        assert.equal(isToolError(dropped), false);
        if (isToolError(dropped)) return;
        assert.deepEqual(viewIds(dropped.type.views), ["list", "outline"]);
        assert.equal(dropped.type.default_view, "list");

        const cleared = await manageType(pool, {
          action: "update",
          slug: "dossier",
          views: [],
        });
        assert.equal(isToolError(cleared), false);
        if (isToolError(cleared)) return;
        assert.deepEqual(viewIds(cleared.type.views), []);
        assert.equal(cleared.type.default_view, undefined);

        const inspected = await inspectOntology(pool, "types");
        const dossier = inspected.types.find((type) => type.slug === "dossier");
        assert.deepEqual(viewIds(dossier?.views), []);
        assert.equal(dossier?.default_view, undefined);
      });

      await t.test("manage_type retires an empty authored type and refuses unsafe retire", async () => {
        const created = await manageType(pool, {
          action: "create",
          slug: "waypoint_retire",
          kind: "artifact",
        });
        assert.equal(isToolError(created), false);
        if (isToolError(created)) return;

        const noConfirm = await manageType(pool, {
          action: "retire",
          slug: "waypoint_retire",
        });
        assert.equal(isToolError(noConfirm), true);
        if (!isToolError(noConfirm)) return;
        assert.match(noConfirm.error, /confirm: true/);

        const system = await manageType(pool, {
          action: "retire",
          slug: "area",
          confirm: true,
        });
        assert.equal(isToolError(system), true);
        if (!isToolError(system)) return;
        assert.match(system.error, /system type "area"/);

        const retired = await manageType(pool, {
          action: "retire",
          slug: "waypoint_retire",
          confirm: true,
        });
        assert.equal(isToolError(retired), false);
        if (isToolError(retired)) return;
        assert.equal(retired.type.slug, "waypoint_retire");

        const ontology = await inspectOntology(pool, "types");
        assert.equal(
          ontology.types.some((type) => type.slug === "waypoint_retire"),
          false,
        );

        const liveType = await manageType(pool, {
          action: "create",
          slug: "waypoint_live",
          kind: "artifact",
        });
        assert.equal(isToolError(liveType), false);
        if (isToolError(liveType)) return;
        const liveNode = await upsertGraphNode(pool, {
          type: "waypoint_live",
          title: "Synthetic live type node",
        });
        assert.equal(isToolError(liveNode), false);
        if (isToolError(liveNode)) return;

        const blockedLive = await manageType(pool, {
          action: "retire",
          slug: "waypoint_live",
          confirm: true,
        });
        assert.equal(isToolError(blockedLive), true);
        if (!isToolError(blockedLive)) return;
        assert.match(blockedLive.error, /still use it/);
        assert.match(blockedLive.suggestion ?? "", /Delete or retype/);

        const tombType = await manageType(pool, {
          action: "create",
          slug: "waypoint_tomb",
          kind: "artifact",
        });
        assert.equal(isToolError(tombType), false);
        if (isToolError(tombType)) return;
        const tombNode = await upsertGraphNode(pool, {
          type: "waypoint_tomb",
          title: "Synthetic retired tombstone",
        });
        assert.equal(isToolError(tombNode), false);
        if (isToolError(tombNode)) return;
        const deleted = await deleteGraphNode(pool, { id: tombNode.node.id, confirm: true });
        assert.equal(isToolError(deleted), false);

        const blockedTomb = await manageType(pool, {
          action: "retire",
          slug: "waypoint_tomb",
          confirm: true,
        });
        assert.equal(isToolError(blockedTomb), true);
        if (!isToolError(blockedTomb)) return;
        assert.match(blockedTomb.error, /deleted node/);
        assert.match(blockedTomb.suggestion ?? "", /purge_deleted: true/);

        const purged = await manageType(pool, {
          action: "retire",
          slug: "waypoint_tomb",
          confirm: true,
          purge_deleted: true,
        });
        assert.equal(isToolError(purged), false);
        const afterPurge = await inspectOntology(pool, "types");
        assert.equal(
          afterPurge.types.some((type) => type.slug === "waypoint_tomb"),
          false,
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
          from_base_updated_at: a.node.updated_at,
          to_base_updated_at: b.node.updated_at,
        });
        assert.equal(isToolError(linked), false);
      });
    } finally {
      await pool.end();
    }
  },
);

test(
  "system task may edit fields and view queries; view ids and slug stay locked",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_system_task_patch");
    try {
      const ontology = await inspectOntology(pool, "types");
      const task = ontology.types.find((type) => type.slug === "task");
      assert.ok(task);
      const restated = await manageType(pool, {
        action: "update",
        slug: "task",
        views: ["board", "list", "calendar", "timeline", "outline"],
      });
      assert.equal(isToolError(restated), false);
      if (isToolError(restated)) {
        return;
      }
      const restatedBoard = restated.type.views?.find((view) => view.id === "board");
      assert.deepEqual(restatedBoard?.filter, {
        clauses: [{ bind: "status", op: "eq", value: "active" }],
      });
      assert.deepEqual(viewIds(restated.type.views), ["board", "list", "calendar", "timeline", "outline"]);

      const query = (task.views ?? []).map((view) =>
        view.id === "board"
          ? {
              ...view,
              filter: { clauses: [{ bind: "status" as const, op: "in" as const, value: ["active", "completed"] }] },
            }
          : view,
      );
      const filtered = await manageType(pool, { action: "update", slug: "task", views: query });
      assert.equal(isToolError(filtered), false);
      if (isToolError(filtered)) {
        return;
      }
      const board = filtered.type.views?.find((view) => view.id === "board");
      assert.deepEqual(board?.filter, {
        clauses: [{ bind: "status", op: "in", value: ["active", "completed"] }],
      });
      assert.deepEqual(viewIds(filtered.type.views), ["board", "list", "calendar", "timeline", "outline"]);

      const withField = await manageType(pool, {
        action: "update",
        slug: "task",
        fields: [
          ...(filtered.type.fields ?? []),
          { name: "note", kind: "string", display: "Note" },
        ],
      });
      assert.equal(isToolError(withField), false);
      if (isToolError(withField)) {
        return;
      }
      assert.ok(withField.type.fields?.some((field) => field.name === "note"));
      assert.ok(withField.type.fields?.some((field) => field.name === "due"));

      const addGraph = await manageType(pool, {
        action: "update",
        slug: "task",
        views: [...(withField.type.views ?? []), { id: "graph" }],
      });
      assert.equal(isToolError(addGraph), true);
      if (isToolError(addGraph)) {
        assert.match(addGraph.error, /views/);
      }

      const dropBoard = await manageType(pool, {
        action: "update",
        slug: "task",
        views: (withField.type.views ?? []).filter((view) => view.id !== "board"),
      });
      assert.equal(isToolError(dropBoard), true);
      if (isToolError(dropBoard)) {
        assert.match(dropBoard.error, /views/);
      }

      const described = await manageType(pool, {
        action: "update",
        slug: "task",
        description: "Discrete action — operator note.",
      });
      assert.equal(isToolError(described), false);
      if (isToolError(described)) {
        return;
      }
      assert.equal(described.type.slug, "task");
      assert.deepEqual(viewIds(described.type.views), ["board", "list", "calendar", "timeline", "outline"]);

      const colored = await manageType(pool, {
        action: "update",
        slug: "task",
        hue: "rose",
        glyph: "Star",
      });
      assert.equal(isToolError(colored), false);
      if (isToolError(colored)) {
        return;
      }
      assert.equal(colored.type.hue, "rose");
      assert.equal(colored.type.glyph, "Star");
      assert.equal(colored.type.slug, "task");
      assert.deepEqual(viewIds(colored.type.views), ["board", "list", "calendar", "timeline", "outline"]);

      const slugBlocked = await manageType(pool, { action: "update", slug: "task", label: "Jobs" });
      assert.equal(isToolError(slugBlocked), true);
    } finally {
      await pool.end();
    }
  },
);

test(
  "seed apply fills missing seed fields and view ids and keeps user edits",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_seed_apply");
    try {
      const ontology = await inspectOntology(pool, "types");
      const task = ontology.types.find((type) => type.slug === "task");
      assert.ok(task);
      const editedViews = (task.views ?? []).map((view) =>
        view.id === "board"
          ? {
              ...view,
              filter: { clauses: [{ bind: "status" as const, op: "in" as const, value: ["active", "completed"] }] },
            }
          : view,
      );
      const edited = await manageType(pool, {
        action: "update",
        slug: "task",
        description: "Operator description",
        views: editedViews,
        fields: [
          ...(task.fields ?? []),
          { name: "note", kind: "string", display: "Note" },
        ],
      });
      assert.equal(isToolError(edited), false);
      await seedSystemOntology(pool);
      const again = await inspectOntology(pool, "types");
      const seeded = again.types.find((type) => type.slug === "task");
      assert.equal(seeded?.description, "Operator description");
      assert.ok(seeded?.fields?.some((field) => field.name === "note"));
      assert.ok(seeded?.fields?.some((field) => field.name === "due"));
      const board = seeded?.views?.find((view) => view.id === "board");
      assert.deepEqual(board?.filter, {
        clauses: [{ bind: "status", op: "in", value: ["active", "completed"] }],
      });
      assert.deepEqual(viewIds(seeded?.views), ["board", "list", "calendar", "timeline", "outline"]);
      assert.equal(seeded?.hue, "green");
      assert.equal(seeded?.glyph, "CircleCheck");

      const recolored = await manageType(pool, { action: "update", slug: "task", hue: "pink", glyph: "Hash" });
      assert.equal(isToolError(recolored), false);
      await seedSystemOntology(pool);
      const kept = (await inspectOntology(pool, "types")).types.find((type) => type.slug === "task");
      assert.equal(kept?.hue, "pink");
      assert.equal(kept?.glyph, "Hash");
    } finally {
      await pool.end();
    }
  },
);

test(
  "operator { id } clear on a system view survives seed apply",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_seed_clear_view");
    try {
      const ontology = await inspectOntology(pool, "types");
      const task = ontology.types.find((type) => type.slug === "task");
      assert.ok(task);
      const cleared = await manageType(pool, {
        action: "update",
        slug: "task",
        views: (task.views ?? []).map((view) =>
          view.id === "board" ? { id: "board" as const } : view,
        ),
      });
      assert.equal(isToolError(cleared), false);
      if (isToolError(cleared)) {
        return;
      }
      assert.equal(cleared.type.views?.find((view) => view.id === "board")?.filter, undefined);

      await seedSystemOntology(pool);
      const again = await inspectOntology(pool, "types");
      const seeded = again.types.find((type) => type.slug === "task");
      const board = seeded?.views?.find((view) => view.id === "board");
      assert.equal(board?.filter, undefined);
      assert.equal(board?.sort, undefined);
      assert.equal(board?.group, undefined);
      assert.deepEqual(viewIds(seeded?.views), ["board", "list", "calendar", "timeline", "outline"]);
      assert.ok(seeded?.fields?.some((field) => field.name === "due"));
    } finally {
      await pool.end();
    }
  },
);

test(
  "ref field stores a pointer and does not create an edge; extra data keys still upsert",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_ref_extra");
    try {
      const created = await manageType(pool, {
        action: "create",
        slug: "mention",
        kind: "artifact",
        fields: [{ name: "who", kind: "ref", ref_type: "person", display: "Who" }],
      });
      assert.equal(isToolError(created), false);
      const person = await upsertGraphNode(pool, { type: "person", title: "Ada" });
      assert.equal(isToolError(person), false);
      if (isToolError(person)) {
        return;
      }
      const mention = await upsertGraphNode(pool, {
        type: "mention",
        title: "Named Ada",
        data: { who: person.node.id },
      });
      assert.equal(isToolError(mention), false);
      if (isToolError(mention)) {
        return;
      }
      assert.equal(mention.node.data.who, person.node.id);
      const got = await getGraphNode(pool, mention.node.id);
      assert.equal(isToolError(got), false);
      if (isToolError(got)) {
        return;
      }
      assert.equal(got.edges.length, 0);

      const dumped = await upsertGraphNode(pool, {
        type: "task",
        title: "Voice dump",
        data: { due: "2026-08-27", dump: "keep this key" },
      });
      assert.equal(isToolError(dumped), false);
      if (isToolError(dumped)) {
        return;
      }
      assert.equal(dumped.node.data.dump, "keep this key");
      assert.equal(dumped.node.data.due, "2026-08-27");
    } finally {
      await pool.end();
    }
  },
);

test(
  "manage_type fields: [] stores an empty template and compiles an open schema",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("graph_empty_fields");
    try {
      const created = await manageType(pool, {
        action: "create",
        slug: "empty_fields_schema",
        kind: "artifact",
        fields: [{ name: "label", kind: "string", display: "Label" }],
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) {
        return;
      }
      const compiled = created.type.json_schema as {
        additionalProperties?: boolean;
        properties?: { label?: unknown };
        required?: unknown;
      } | null;
      assert.equal(compiled?.additionalProperties, true);
      assert.ok(compiled?.properties?.label);
      assert.equal(compiled?.required, undefined);

      const emptied = await manageType(pool, {
        action: "update",
        slug: "empty_fields_schema",
        fields: [],
      });
      assert.equal(isToolError(emptied), false);
      if (isToolError(emptied)) {
        return;
      }
      assert.deepEqual(emptied.type.fields, []);
      assert.equal(emptied.type.json_schema, null);

      const dumped = await upsertGraphNode(pool, {
        type: "empty_fields_schema",
        title: "Voice dump",
        data: { extra: "kept", label: "optional leftover" },
      });
      assert.equal(isToolError(dumped), false);
      if (isToolError(dumped)) {
        return;
      }
      assert.equal(dumped.node.data.extra, "kept");
    } finally {
      await pool.end();
    }
  },
);
