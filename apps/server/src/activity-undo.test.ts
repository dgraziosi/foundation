import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, insertActivity, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError, viewIds } from "@foundation/schema";
import {
  deleteGraphNode,
  getGraphNode,
  inspectOntology,
  linkGraphNodes,
  listGraphActivity,
  manageRelation,
  manageType,
  searchGraphNodes,
  undoGraphActivity,
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

test("activity undo inverses, filters, and confirm gates", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("activity_undo");
  try {
    await t.test("undo of create soft-deletes; second undo fails; compensating is not reversible", async () => {
      const created = await upsertGraphNode(pool, { type: "note", title: "scratch pad" });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;

      const refused = await undoGraphActivity(pool, { id: created.activity_id });
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) return;
      assert.match(refused.error, /confirm: true/);

      const undone = await undoGraphActivity(pool, {
        id: created.activity_id,
        confirm: true,
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(undone), false);
      if (isToolError(undone)) return;

      const gone = await getGraphNode(pool, created.node.id);
      assert.equal(isToolError(gone), true);

      const second = await undoGraphActivity(pool, { id: created.activity_id, confirm: true });
      assert.equal(isToolError(second), true);
      if (!isToolError(second)) return;
      assert.match(second.error, /already undone/);

      const compensate = await undoGraphActivity(pool, { id: undone.activity_id, confirm: true });
      assert.equal(isToolError(compensate), true);
      if (!isToolError(compensate)) return;
      assert.match(compensate.error, /not reversible/);
    });

    await t.test("undo of update restores before payload/title/status", async () => {
      const created = await upsertGraphNode(pool, {
        type: "note",
        title: "before title",
        payload: { media_type: "text/plain", storage: "inline", body: "v1" },
        status: "active",
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;

      const updated = await upsertGraphNode(pool, {
        id: created.node.id,
        type: "note",
        title: "after title",
        payload: { media_type: "text/plain", storage: "inline", body: "v2" },
        status: "completed",
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(updated), false);
      if (isToolError(updated)) return;

      const undone = await undoGraphActivity(pool, {
        id: updated.activity_id,
        confirm: true,
        base_updated_at: updated.node.updated_at,
      });
      assert.equal(isToolError(undone), false);

      const got = await getGraphNode(pool, created.node.id);
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      assert.equal(got.node.title, "before title");
      assert.equal(got.node.payload.body, "v1");
      assert.equal(got.node.status, "active");
    });

    await t.test("undo of delete restores the node and keeps incident edges", async () => {
      const a = await upsertGraphNode(pool, { type: "note", title: "linked note" });
      const b = await upsertGraphNode(pool, { type: "idea", title: "related idea" });
      assert.equal(isToolError(a), false);
      assert.equal(isToolError(b), false);
      if (isToolError(a) || isToolError(b)) return;

      const linked = await linkGraphNodes(pool, {
        from_id: a.node.id,
        to_id: b.node.id,
        relation_type: "inspired_by",
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;

      const deleted = await deleteGraphNode(pool, {
        id: a.node.id,
        confirm: true,
        base_updated_at: a.node.updated_at,
      });
      assert.equal(isToolError(deleted), false);
      if (isToolError(deleted)) return;

      const hidden = await getGraphNode(pool, a.node.id);
      assert.equal(isToolError(hidden), true);

      const restored = await undoGraphActivity(pool, {
        id: deleted.activity_id,
        confirm: true,
        base_updated_at: a.node.updated_at,
      });
      assert.equal(isToolError(restored), false);

      const got = await getGraphNode(pool, a.node.id);
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      assert.equal(got.node.title, "linked note");
      assert.equal(got.edges.length, 1);
      assert.equal(got.edges[0]?.relation_type, "inspired_by");
    });

    await t.test("undo of link removes the edge; undo of unlink restores it", async () => {
      const a = await upsertGraphNode(pool, { type: "note", title: "A" });
      const b = await upsertGraphNode(pool, { type: "idea", title: "B" });
      if (isToolError(a) || isToolError(b)) {
        assert.fail("upsert failed");
        return;
      }
      const linked = await linkGraphNodes(pool, {
        from_id: a.node.id,
        to_id: b.node.id,
        relation_type: "references",
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;

      const unlinkedByUndo = await undoGraphActivity(pool, {
        id: linked.activity_id,
        confirm: true,
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(unlinkedByUndo), false);
      const afterUndoLink = await getGraphNode(pool, a.node.id);
      assert.equal(isToolError(afterUndoLink), false);
      if (isToolError(afterUndoLink)) return;
      assert.equal(afterUndoLink.edges.length, 0);

      const relinked = await linkGraphNodes(pool, {
        from_id: a.node.id,
        to_id: b.node.id,
        relation_type: "references",
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(relinked), false);
      if (isToolError(relinked)) return;

      const removed = await unlinkGraphNodes(pool, {
        from_id: a.node.id,
        to_id: b.node.id,
        relation_type: "references",
        confirm: true,
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(removed), false);
      if (isToolError(removed)) return;

      const restored = await undoGraphActivity(pool, {
        id: removed.activity_id,
        confirm: true,
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(restored), false);
      const got = await getGraphNode(pool, a.node.id);
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      assert.equal(got.edges.length, 1);
      assert.equal(got.edges[0]?.relation_type, "references");
    });

    await t.test("undo of type_change create deletes unused type; update restores; in-use type refuses", async () => {
      const created = await manageType(pool, {
        action: "create",
        slug: "meeting_undo",
        description: "A scheduled conversation",
        kind: "artifact",
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;

      const unusedUndo = await undoGraphActivity(pool, {
        id: created.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(unusedUndo), false);
      const ontology = await inspectOntology(pool, "types");
      assert.equal(
        ontology.types.some((type) => type.slug === "meeting_undo"),
        false,
      );

      const typed = await manageType(pool, {
        action: "create",
        slug: "meeting_edit",
        description: "original",
        kind: "artifact",
      });
      assert.equal(isToolError(typed), false);
      if (isToolError(typed)) return;
      const edited = await manageType(pool, {
        action: "update",
        slug: "meeting_edit",
        description: "changed",
      });
      assert.equal(isToolError(edited), false);
      if (isToolError(edited)) return;
      const reverted = await undoGraphActivity(pool, { id: edited.activity_id, confirm: true });
      assert.equal(isToolError(reverted), false);
      const after = await inspectOntology(pool, "types");
      assert.equal(after.types.find((type) => type.slug === "meeting_edit")?.description, "original");

      const again = await manageType(pool, {
        action: "create",
        slug: "meeting_used",
        kind: "artifact",
      });
      assert.equal(isToolError(again), false);
      if (isToolError(again)) return;
      const node = await upsertGraphNode(pool, { type: "meeting_used", title: "Kickoff" });
      assert.equal(isToolError(node), false);

      const blocked = await undoGraphActivity(pool, { id: again.activity_id, confirm: true });
      assert.equal(isToolError(blocked), true);
      if (!isToolError(blocked)) return;
      assert.match(blocked.error, /still use it/);
    });

    await t.test("undo of type retire restores the authored type", async () => {
      const typed = await manageType(pool, {
        action: "create",
        slug: "meeting_retire_undo",
        kind: "artifact",
        description: "restored by undo",
      });
      assert.equal(isToolError(typed), false);
      if (isToolError(typed)) return;

      const retired = await manageType(pool, {
        action: "retire",
        slug: "meeting_retire_undo",
        confirm: true,
      });
      assert.equal(isToolError(retired), false);
      if (isToolError(retired)) return;

      const restored = await undoGraphActivity(pool, {
        id: retired.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(restored), false);
      const ontology = await inspectOntology(pool, "types");
      const row = ontology.types.find((type) => type.slug === "meeting_retire_undo");
      assert.equal(row?.description, "restored by undo");
      assert.equal(row?.is_system, false);
    });

    await t.test("undo of type create without purge keeps tombstones restorable", async () => {
      const typed = await manageType(pool, {
        action: "create",
        slug: "meeting_tombstone",
        kind: "artifact",
      });
      assert.equal(isToolError(typed), false);
      if (isToolError(typed)) return;
      const created = await upsertGraphNode(pool, {
        type: "meeting_tombstone",
        title: "Deleted kickoff",
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const peer = await upsertGraphNode(pool, { type: "note", title: "peer" });
      assert.equal(isToolError(peer), false);
      if (isToolError(peer)) return;
      const linked = await linkGraphNodes(pool, {
        from_id: created.node.id,
        to_id: peer.node.id,
        relation_type: "references",
        from_base_updated_at: created.node.updated_at,
        to_base_updated_at: peer.node.updated_at,
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      const deleted = await deleteGraphNode(pool, {
        id: created.node.id,
        confirm: true,
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(deleted), false);
      if (isToolError(deleted)) return;

      const refused = await undoGraphActivity(pool, {
        id: typed.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) return;
      assert.match(refused.error, /deleted node/);
      assert.match(refused.suggestion ?? "", /purge_deleted: true/);

      const ontology = await inspectOntology(pool, "types");
      assert.equal(
        ontology.types.some((type) => type.slug === "meeting_tombstone"),
        true,
      );
      const listed = await listGraphActivity(pool, { action: "delete", target: created.node.id });
      assert.equal(isToolError(listed), false);
      if (isToolError(listed)) return;
      assert.equal(
        listed.activities.find((row) => row.id === deleted.activity_id)?.reversible,
        true,
      );

      const restored = await undoGraphActivity(pool, {
        id: deleted.activity_id,
        confirm: true,
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(restored), false);
      const got = await getGraphNode(pool, created.node.id);
      assert.equal(isToolError(got), false);
      if (isToolError(got)) return;
      assert.equal(got.node.title, "Deleted kickoff");
      assert.equal(got.edges.some((edge) => edge.relation_type === "references"), true);

      const blockedLive = await undoGraphActivity(pool, {
        id: typed.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(blockedLive), true);
      if (!isToolError(blockedLive)) return;
      assert.match(blockedLive.error, /still use it/);
    });

    await t.test("undo of type create with purge_deleted drops tombstones and prior delete undos", async () => {
      const typed = await manageType(pool, {
        action: "create",
        slug: "meeting_purge",
        kind: "artifact",
      });
      assert.equal(isToolError(typed), false);
      if (isToolError(typed)) return;
      const created = await upsertGraphNode(pool, {
        type: "meeting_purge",
        title: "Purged kickoff",
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const peer = await upsertGraphNode(pool, { type: "note", title: "purge peer" });
      assert.equal(isToolError(peer), false);
      if (isToolError(peer)) return;
      const linked = await linkGraphNodes(pool, {
        from_id: created.node.id,
        to_id: peer.node.id,
        relation_type: "references",
        from_base_updated_at: created.node.updated_at,
        to_base_updated_at: peer.node.updated_at,
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;
      const deleted = await deleteGraphNode(pool, {
        id: created.node.id,
        confirm: true,
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(deleted), false);
      if (isToolError(deleted)) return;

      const purged = await undoGraphActivity(pool, {
        id: typed.activity_id,
        confirm: true,
        purge_deleted: true,
      });
      assert.equal(isToolError(purged), false);
      const ontology = await inspectOntology(pool, "types");
      assert.equal(
        ontology.types.some((type) => type.slug === "meeting_purge"),
        false,
      );

      const listed = await listGraphActivity(pool, { action: "delete", target: created.node.id });
      assert.equal(isToolError(listed), false);
      if (isToolError(listed)) return;
      assert.equal(
        listed.activities.find((row) => row.id === deleted.activity_id)?.reversible,
        false,
      );

      const restoreRefused = await undoGraphActivity(pool, {
        id: deleted.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(restoreRefused), true);
      if (!isToolError(restoreRefused)) return;
      assert.match(restoreRefused.error, /not reversible/);

      const gone = await getGraphNode(pool, created.node.id);
      assert.equal(isToolError(gone), true);
    });

    await t.test("undo of type create after undoing node create still needs purge_deleted", async () => {
      const typed = await manageType(pool, {
        action: "create",
        slug: "meeting_undone_node",
        kind: "artifact",
      });
      assert.equal(isToolError(typed), false);
      if (isToolError(typed)) return;
      const created = await upsertGraphNode(pool, {
        type: "meeting_undone_node",
        title: "Undone kickoff",
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      const nodeUndone = await undoGraphActivity(pool, {
        id: created.activity_id,
        confirm: true,
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(nodeUndone), false);

      const refused = await undoGraphActivity(pool, {
        id: typed.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(refused), true);
      if (!isToolError(refused)) return;
      assert.match(refused.error, /deleted node/);

      const purged = await undoGraphActivity(pool, {
        id: typed.activity_id,
        confirm: true,
        purge_deleted: true,
      });
      assert.equal(isToolError(purged), false);
      const ontology = await inspectOntology(pool, "types");
      assert.equal(
        ontology.types.some((type) => type.slug === "meeting_undone_node"),
        false,
      );
    });

    await t.test("undo of unlink maps a missing relation FK to a tool error", async () => {
      const relation = await manageRelation(pool, {
        action: "create",
        slug: "blocked_by_undo",
        kind: "associative",
      });
      assert.equal(isToolError(relation), false);
      if (isToolError(relation)) return;

      const a = await upsertGraphNode(pool, { type: "note", title: "blocked" });
      const b = await upsertGraphNode(pool, { type: "note", title: "blocker" });
      assert.equal(isToolError(a), false);
      assert.equal(isToolError(b), false);
      if (isToolError(a) || isToolError(b)) return;

      const linked = await linkGraphNodes(pool, {
        from_id: a.node.id,
        to_id: b.node.id,
        relation_type: "blocked_by_undo",
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(linked), false);
      if (isToolError(linked)) return;

      const unlinked = await unlinkGraphNodes(pool, {
        from_id: a.node.id,
        to_id: b.node.id,
        relation_type: "blocked_by_undo",
        confirm: true,
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(unlinked), false);
      if (isToolError(unlinked)) return;

      const relationGone = await undoGraphActivity(pool, {
        id: relation.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(relationGone), false);

      const restored = await undoGraphActivity(pool, {
        id: unlinked.activity_id,
        confirm: true,
        from_base_updated_at: a.node.updated_at,
        to_base_updated_at: b.node.updated_at,
      });
      assert.equal(isToolError(restored), true);
      if (!isToolError(restored)) return;
      assert.match(restored.error, /missing relation or node/);
      assert.match(restored.suggestion ?? "", /Restore the relation/);
    });

    await t.test("undo of update maps a missing type FK to a tool error", async () => {
      const typed = await manageType(pool, {
        action: "create",
        slug: "meeting_retype",
        kind: "artifact",
      });
      assert.equal(isToolError(typed), false);
      if (isToolError(typed)) return;

      const created = await upsertGraphNode(pool, {
        type: "meeting_retype",
        title: "Retype me",
      });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;

      const retyped = await upsertGraphNode(pool, {
        id: created.node.id,
        type: "note",
        title: "Retype me",
        base_updated_at: created.node.updated_at,
      });
      assert.equal(isToolError(retyped), false);
      if (isToolError(retyped)) return;

      const typeGone = await undoGraphActivity(pool, {
        id: typed.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(typeGone), false);

      const restored = await undoGraphActivity(pool, {
        id: retyped.activity_id,
        confirm: true,
        base_updated_at: retyped.node.updated_at,
      });
      assert.equal(isToolError(restored), true);
      if (!isToolError(restored)) return;
      assert.match(restored.error, /missing type/);
      assert.match(restored.suggestion ?? "", /Restore the type/);
    });

    await t.test("list_activity filters by action, target, and since", async () => {
      const note = await upsertGraphNode(pool, { type: "note", title: "filter me" });
      assert.equal(isToolError(note), false);
      if (isToolError(note)) return;

      const byAction = await listGraphActivity(pool, { action: "create", target: note.node.id });
      assert.equal(isToolError(byAction), false);
      if (isToolError(byAction)) return;
      assert.ok(byAction.activities.length >= 1);
      assert.ok(byAction.activities.every((row) => row.action === "create"));
      assert.ok(byAction.activities.every((row) => row.target_id === note.node.id));
      assert.equal(byAction.activities[0]?.reversible, true);
      assert.equal(byAction.activities[0]?.undone_at, null);

      const future = await listGraphActivity(pool, {
        since: "2099-01-01T00:00:00.000Z",
      });
      assert.equal(isToolError(future), false);
      if (isToolError(future)) return;
      assert.equal(future.activities.length, 0);

      const invalid = await listGraphActivity(pool, { since: "not-a-date" });
      assert.equal(isToolError(invalid), true);
    });

    await t.test("expired undo token refuses", async () => {
      const created = await upsertGraphNode(pool, { type: "note", title: "stale token" });
      assert.equal(isToolError(created), false);
      if (isToolError(created)) return;
      await pool.query(`UPDATE activity SET token_expires_at = now() - interval '1 hour' WHERE id = $1`, [
        created.activity_id,
      ]);
      const expired = await undoGraphActivity(pool, { id: created.activity_id, confirm: true });
      assert.equal(isToolError(expired), true);
      if (!isToolError(expired)) return;
      assert.match(expired.error, /expired/);
    });

    await t.test("FTS search finds HTML itinerary text, type-filters, and skips deleted", async () => {
      const html =
        "<!DOCTYPE html><html><body><h1>Kyoto spring</h1><p>Day 1: Fushimi Inari then arrive NRT leftover</p></body></html>";
      const trip = await upsertGraphNode(pool, {
        type: "trip",
        title: "Japan week",
        payload: { media_type: "text/html", storage: "inline", body: html },
      });
      assert.equal(isToolError(trip), false);
      if (isToolError(trip)) return;

      const decoy = await upsertGraphNode(pool, {
        type: "note",
        title: "Unrelated",
        payload: { media_type: "text/plain", storage: "inline", body: "Fushimi Inari in a note" },
      });
      assert.equal(isToolError(decoy), false);
      if (isToolError(decoy)) return;

      const hits = await searchGraphNodes(pool, { query: "Fushimi Inari" });
      assert.equal(isToolError(hits), false);
      if (isToolError(hits)) return;
      assert.ok(hits.nodes.some((node) => node.id === trip.node.id));

      const nrt = await searchGraphNodes(pool, { query: "NRT", type: "trip" });
      assert.equal(isToolError(nrt), false);
      if (isToolError(nrt)) return;
      assert.ok(nrt.nodes.some((node) => node.id === trip.node.id));
      assert.ok(nrt.nodes.every((node) => node.type === "trip"));

      const deleted = await deleteGraphNode(pool, {
        id: trip.node.id,
        confirm: true,
        base_updated_at: trip.node.updated_at,
      });
      assert.equal(isToolError(deleted), false);
      const afterDelete = await searchGraphNodes(pool, { query: "Fushimi Inari", type: "trip" });
      assert.equal(isToolError(afterDelete), false);
      if (isToolError(afterDelete)) return;
      assert.equal(
        afterDelete.nodes.some((node) => node.id === trip.node.id),
        false,
      );
    });

    await t.test("undo of a restyle-era task snapshot does not drop due", async () => {
      const ontology = await inspectOntology(pool, "types");
      const task = ontology.types.find((type) => type.slug === "task");
      assert.ok(task);
      assert.ok(task.fields?.some((field) => field.name === "due"));

      const changed = await manageType(pool, {
        action: "update",
        slug: "task",
        description: "changed for legacy undo",
        views: (task.views ?? []).map((view) =>
          view.id === "board"
            ? {
                ...view,
                filter: { clauses: [{ bind: "status" as const, op: "in" as const, value: ["active", "completed"] }] },
              }
            : view,
        ),
      });
      assert.equal(isToolError(changed), false);
      if (isToolError(changed)) {
        return;
      }

      const { id } = await insertActivity(pool, {
        actor: "user",
        action: "type_change",
        target_kind: "type",
        target_id: "task",
        before: {
          slug: task.slug,
          label: task.label,
          description: task.description,
          kind: task.kind,
          parent_types: task.parent_types,
          json_schema: task.json_schema,
          views: ["board", "list", "calendar", "timeline", "outline"],
          default_view: "board",
          is_system: true,
        },
        after: changed.type,
        reversible: true,
      });

      const undone = await undoGraphActivity(pool, { id, confirm: true });
      assert.equal(isToolError(undone), false);
      if (isToolError(undone)) {
        assert.fail(undone.error);
        return;
      }
      const after = await inspectOntology(pool, "types");
      const restored = after.types.find((type) => type.slug === "task");
      assert.equal(restored?.description, task.description);
      assert.ok(restored?.fields?.some((field) => field.name === "due"));
      const board = restored?.views?.find((view) => view.id === "board");
      assert.deepEqual(board?.filter, { clauses: [{ bind: "status", op: "eq", value: "active" }] });
    });

    await t.test("undo of a task whose board filter was cleared stays cleared", async () => {
      const ontology = await inspectOntology(pool, "types");
      const task = ontology.types.find((type) => type.slug === "task");
      assert.ok(task);

      const cleared = await manageType(pool, {
        action: "update",
        slug: "task",
        views: (task.views ?? []).map((view) => ({ id: view.id })),
      });
      assert.equal(isToolError(cleared), false);
      if (isToolError(cleared)) {
        return;
      }
      assert.equal(cleared.type.views?.find((view) => view.id === "board")?.filter, undefined);

      const described = await manageType(pool, {
        action: "update",
        slug: "task",
        description: "temporary description for cleared-board undo",
      });
      assert.equal(isToolError(described), false);
      if (isToolError(described)) {
        return;
      }

      const undone = await undoGraphActivity(pool, { id: described.activity_id, confirm: true });
      assert.equal(isToolError(undone), false);
      if (isToolError(undone)) {
        assert.fail(undone.error);
        return;
      }
      const after = await inspectOntology(pool, "types");
      const restored = after.types.find((type) => type.slug === "task");
      assert.equal(restored?.description, cleared.type.description);
      assert.equal(restored?.views?.find((view) => view.id === "board")?.filter, undefined);
      assert.ok(restored?.fields?.some((field) => field.name === "due"));
    });

    await t.test("undo accepts pre-slice type snapshots with string view ids", async () => {
      const authored = await manageType(pool, {
        action: "create",
        slug: "legacy_snapshot_type",
        kind: "artifact",
        description: "legacy views",
        views: ["card", "list"],
        default_view: "card",
      });
      assert.equal(isToolError(authored), false);
      if (isToolError(authored)) {
        return;
      }

      const retired = await manageType(pool, {
        action: "retire",
        slug: "legacy_snapshot_type",
        confirm: true,
      });
      assert.equal(isToolError(retired), false);
      if (isToolError(retired)) {
        return;
      }

      await pool.query(`UPDATE activity SET before = jsonb_set(before, '{views}', $1::jsonb) WHERE id = $2`, [
        JSON.stringify(["card", "list"]),
        retired.activity_id,
      ]);

      const restoredAuthored = await undoGraphActivity(pool, {
        id: retired.activity_id,
        confirm: true,
      });
      assert.equal(isToolError(restoredAuthored), false);
      if (isToolError(restoredAuthored)) {
        assert.fail(restoredAuthored.error);
        return;
      }
      const ontology2 = await inspectOntology(pool, "types");
      const row = ontology2.types.find((type) => type.slug === "legacy_snapshot_type");
      assert.equal(row?.description, "legacy views");
      assert.deepEqual(viewIds(row?.views), ["card", "list"]);
    });
  } finally {
    await pool.end();
  }
});
