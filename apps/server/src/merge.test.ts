import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { isToolError } from "@foundation/schema";
import { getGraphNode, linkGraphNodes, manageType, upsertGraphNode } from "./graph.js";
import { mergeGraphNodes } from "./merge.js";
import { undoGraphActivity } from "./undo.js";
import { DESTRUCTIVE } from "./write-context.js";

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

test("merge keep drop happy path, refusals, and undo", { skip: !databaseUrl }, async (t) => {
  if (!databaseUrl) {
    return;
  }
  const pool = await poolForSchema("graph_merge");
  t.after(async () => {
    await pool.end();
  });

  await t.test("same-type merge retargets edges, unions aliases, moves identity, and undoes", async () => {
    const keep = await upsertGraphNode(pool, {
      type: "note",
      title: "Keep note",
      data: { aliases: ["Keep Alias"] },
    });
    const drop = await upsertGraphNode(pool, {
      type: "note",
      title: "Drop note",
      data: {
        aliases: ["Drop Alias"],
        repo: { system: "github", id: "org/merge-fixture" },
      },
    });
    const neighbor = await upsertGraphNode(pool, { type: "idea", title: "Neighbor idea" });
    assert.equal(isToolError(keep), false);
    assert.equal(isToolError(drop), false);
    assert.equal(isToolError(neighbor), false);
    if (isToolError(keep) || isToolError(drop) || isToolError(neighbor)) return;

    const linked = await linkGraphNodes(pool, {
      from_id: drop.node.id,
      to_id: neighbor.node.id,
      relation_type: "inspired_by",
      from_base_updated_at: drop.node.updated_at,
      to_base_updated_at: neighbor.node.updated_at,
    });
    assert.equal(isToolError(linked), false);
    if (isToolError(linked)) return;

    const freshDrop = await getGraphNode(pool, drop.node.id);
    const freshKeep = await getGraphNode(pool, keep.node.id);
    assert.equal(isToolError(freshDrop), false);
    assert.equal(isToolError(freshKeep), false);
    if (isToolError(freshDrop) || isToolError(freshKeep)) return;

    const merged = await mergeGraphNodes(
      pool,
      {
        keep: keep.node.id,
        drop: drop.node.id,
        keep_base_updated_at: freshKeep.node.updated_at,
        drop_base_updated_at: freshDrop.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(merged), false);
    if (isToolError(merged)) return;
    assert.match(merged.activity_id, /^[0-9a-f-]{36}$/);

    const afterKeep = await getGraphNode(pool, keep.node.id);
    assert.equal(isToolError(afterKeep), false);
    if (isToolError(afterKeep)) return;
    assert.deepEqual(afterKeep.node.data.aliases, ["Keep Alias", "Drop Alias"]);
    assert.deepEqual(afterKeep.node.data.repo, { system: "github", id: "org/merge-fixture" });
    assert.equal(afterKeep.node.title, "Keep note");
    assert.equal(afterKeep.edges.length, 1);
    assert.equal(afterKeep.edges[0]?.relation_type, "inspired_by");
    assert.equal(afterKeep.edges[0]?.neighbor.id, neighbor.node.id);

    const hidden = await getGraphNode(pool, drop.node.id);
    assert.equal(isToolError(hidden), true);
    if (isToolError(hidden)) {
      assert.match(hidden.error, /Node not found/);
    }

    const undone = await undoGraphActivity(
      pool,
      { id: merged.activity_id, base_updated_at: afterKeep.node.updated_at },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(undone), false);
    if (isToolError(undone)) return;

    const restoredDrop = await getGraphNode(pool, drop.node.id);
    const restoredKeep = await getGraphNode(pool, keep.node.id);
    assert.equal(isToolError(restoredDrop), false);
    assert.equal(isToolError(restoredKeep), false);
    if (isToolError(restoredDrop) || isToolError(restoredKeep)) return;
    assert.deepEqual(restoredDrop.node.data.aliases, ["Drop Alias"]);
    assert.deepEqual(restoredDrop.node.data.repo, { system: "github", id: "org/merge-fixture" });
    assert.equal(restoredDrop.edges.length, 1);
    assert.equal(restoredDrop.edges[0]?.neighbor.id, neighbor.node.id);
    assert.deepEqual(restoredKeep.node.data.aliases, ["Keep Alias"]);
    assert.equal(restoredKeep.node.data.repo, undefined);
    assert.equal(restoredKeep.edges.length, 0);
  });

  await t.test("missing confirm, missing scope, stale if-match, and different types refuse", async () => {
    const keep = await upsertGraphNode(pool, { type: "note", title: "CAS keep" });
    const drop = await upsertGraphNode(pool, { type: "note", title: "CAS drop" });
    const person = await upsertGraphNode(pool, { type: "person", title: "Other type" });
    assert.equal(isToolError(keep), false);
    assert.equal(isToolError(drop), false);
    assert.equal(isToolError(person), false);
    if (isToolError(keep) || isToolError(drop) || isToolError(person)) return;

    const noConfirm = await mergeGraphNodes(
      pool,
      {
        keep: keep.node.id,
        drop: drop.node.id,
        keep_base_updated_at: keep.node.updated_at,
        drop_base_updated_at: drop.node.updated_at,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(noConfirm), true);
    if (isToolError(noConfirm)) {
      assert.equal(noConfirm.error, "merge needs confirm: true");
    }

    const noScope = await mergeGraphNodes(pool, {
      keep: keep.node.id,
      drop: drop.node.id,
      keep_base_updated_at: keep.node.updated_at,
      drop_base_updated_at: drop.node.updated_at,
      confirm: true,
    });
    assert.equal(isToolError(noScope), true);
    if (isToolError(noScope)) {
      assert.equal(noScope.error, "merge needs a key with destructive scope");
    }

    const stale = await mergeGraphNodes(
      pool,
      {
        keep: keep.node.id,
        drop: drop.node.id,
        keep_base_updated_at: "2000-01-01T00:00:00.000Z",
        drop_base_updated_at: drop.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(stale), true);
    if (isToolError(stale)) {
      assert.match(stale.error, /does not match current updated_at/);
      assert.doesNotMatch(stale.error, /not found/i);
    }
    const stillLive = await getGraphNode(pool, drop.node.id);
    assert.equal(isToolError(stillLive), false);

    const typed = await mergeGraphNodes(
      pool,
      {
        keep: keep.node.id,
        drop: person.node.id,
        keep_base_updated_at: keep.node.updated_at,
        drop_base_updated_at: person.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(typed), true);
    if (isToolError(typed)) {
      assert.match(typed.error, /keep is note, drop is person/);
    }
  });

  await t.test("conflicting unique identity refuses and retargets declared refs", async () => {
    const keep = await upsertGraphNode(pool, {
      type: "note",
      title: "Url keep",
      url: { system: "gmail", id: "msg-keep" },
    });
    const drop = await upsertGraphNode(pool, {
      type: "note",
      title: "Url drop",
      url: { system: "gmail", id: "msg-drop" },
    });
    assert.equal(isToolError(keep), false);
    assert.equal(isToolError(drop), false);
    if (isToolError(keep) || isToolError(drop)) return;

    const conflict = await mergeGraphNodes(
      pool,
      {
        keep: keep.node.id,
        drop: drop.node.id,
        keep_base_updated_at: keep.node.updated_at,
        drop_base_updated_at: drop.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(conflict), true);
    if (isToolError(conflict)) {
      assert.match(conflict.error, /conflicting url identity/);
    }

    const mention = await manageType(pool, {
      action: "create",
      slug: "mention",
      kind: "artifact",
      label: "Mention",
      fields: [{ name: "who", kind: "ref", ref_type: "note", display: "Who" }],
    });
    assert.equal(isToolError(mention), false);
    if (isToolError(mention)) return;

    const targetKeep = await upsertGraphNode(pool, { type: "note", title: "Ref keep" });
    const targetDrop = await upsertGraphNode(pool, { type: "note", title: "Ref drop" });
    assert.equal(isToolError(targetKeep), false);
    assert.equal(isToolError(targetDrop), false);
    if (isToolError(targetKeep) || isToolError(targetDrop)) return;

    const pointer = await upsertGraphNode(pool, {
      type: "mention",
      title: "Points at drop",
      data: { who: targetDrop.node.id },
    });
    assert.equal(isToolError(pointer), false);
    if (isToolError(pointer)) return;

    const merged = await mergeGraphNodes(
      pool,
      {
        keep: targetKeep.node.id,
        drop: targetDrop.node.id,
        keep_base_updated_at: targetKeep.node.updated_at,
        drop_base_updated_at: targetDrop.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(merged), false);
    if (isToolError(merged)) return;

    const pointed = await getGraphNode(pool, pointer.node.id);
    assert.equal(isToolError(pointed), false);
    if (isToolError(pointed)) return;
    assert.equal(pointed.node.data.who, targetKeep.node.id);

    const afterKeep = await getGraphNode(pool, targetKeep.node.id);
    assert.equal(isToolError(afterKeep), false);
    if (isToolError(afterKeep)) return;
    const undone = await undoGraphActivity(
      pool,
      { id: merged.activity_id, base_updated_at: afterKeep.node.updated_at },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(undone), false);
    const restoredPointer = await getGraphNode(pool, pointer.node.id);
    const restoredDrop = await getGraphNode(pool, targetDrop.node.id);
    assert.equal(isToolError(restoredPointer), false);
    assert.equal(isToolError(restoredDrop), false);
    if (isToolError(restoredPointer) || isToolError(restoredDrop)) return;
    assert.equal(restoredPointer.node.data.who, targetDrop.node.id);
  });

  await t.test("different hierarchy parents refuse; keep-drop child_of is dropped as a self loop", async () => {
    const parentA = await upsertGraphNode(pool, { type: "project", title: "Parent A" });
    const parentB = await upsertGraphNode(pool, { type: "project", title: "Parent B" });
    const childKeep = await upsertGraphNode(pool, { type: "task", title: "Child keep" });
    const childDrop = await upsertGraphNode(pool, { type: "task", title: "Child drop" });
    assert.equal(isToolError(parentA), false);
    assert.equal(isToolError(parentB), false);
    assert.equal(isToolError(childKeep), false);
    assert.equal(isToolError(childDrop), false);
    if (
      isToolError(parentA) ||
      isToolError(parentB) ||
      isToolError(childKeep) ||
      isToolError(childDrop)
    ) {
      return;
    }

    const hangKeep = await linkGraphNodes(pool, {
      from_id: childKeep.node.id,
      to_id: parentA.node.id,
      relation_type: "child_of",
      from_base_updated_at: childKeep.node.updated_at,
      to_base_updated_at: parentA.node.updated_at,
    });
    const hangDrop = await linkGraphNodes(pool, {
      from_id: childDrop.node.id,
      to_id: parentB.node.id,
      relation_type: "child_of",
      from_base_updated_at: childDrop.node.updated_at,
      to_base_updated_at: parentB.node.updated_at,
    });
    assert.equal(isToolError(hangKeep), false);
    assert.equal(isToolError(hangDrop), false);
    if (isToolError(hangKeep) || isToolError(hangDrop)) return;

    const freshKeep = await getGraphNode(pool, childKeep.node.id);
    const freshDrop = await getGraphNode(pool, childDrop.node.id);
    assert.equal(isToolError(freshKeep), false);
    assert.equal(isToolError(freshDrop), false);
    if (isToolError(freshKeep) || isToolError(freshDrop)) return;

    const refused = await mergeGraphNodes(
      pool,
      {
        keep: childKeep.node.id,
        drop: childDrop.node.id,
        keep_base_updated_at: freshKeep.node.updated_at,
        drop_base_updated_at: freshDrop.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(refused), true);
    if (isToolError(refused)) {
      assert.match(refused.error, /different hierarchy parents/);
    }

    const loopKeep = await upsertGraphNode(pool, { type: "note", title: "Loop keep" });
    const loopDrop = await upsertGraphNode(pool, { type: "note", title: "Loop drop" });
    assert.equal(isToolError(loopKeep), false);
    assert.equal(isToolError(loopDrop), false);
    if (isToolError(loopKeep) || isToolError(loopDrop)) return;
    const loop = await linkGraphNodes(pool, {
      from_id: loopDrop.node.id,
      to_id: loopKeep.node.id,
      relation_type: "inspired_by",
      from_base_updated_at: loopDrop.node.updated_at,
      to_base_updated_at: loopKeep.node.updated_at,
    });
    assert.equal(isToolError(loop), false);
    if (isToolError(loop)) return;
    const loopKeepFresh = await getGraphNode(pool, loopKeep.node.id);
    const loopDropFresh = await getGraphNode(pool, loopDrop.node.id);
    assert.equal(isToolError(loopKeepFresh), false);
    assert.equal(isToolError(loopDropFresh), false);
    if (isToolError(loopKeepFresh) || isToolError(loopDropFresh)) return;
    const merged = await mergeGraphNodes(
      pool,
      {
        keep: loopKeep.node.id,
        drop: loopDrop.node.id,
        keep_base_updated_at: loopKeepFresh.node.updated_at,
        drop_base_updated_at: loopDropFresh.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(merged), false);
    const after = await getGraphNode(pool, loopKeep.node.id);
    assert.equal(isToolError(after), false);
    if (isToolError(after)) return;
    assert.equal(after.edges.length, 0);
  });

  await t.test("merging a node with its same-type parent hangs keep under drop's parent", async () => {
    const typed = await manageType(pool, {
      action: "create",
      slug: "nest",
      kind: "artifact",
      label: "Nest",
    });
    assert.equal(isToolError(typed), false);
    if (isToolError(typed)) return;
    const nested = await manageType(pool, { action: "update", slug: "nest", parent_types: ["nest"] });
    assert.equal(isToolError(nested), false);
    if (isToolError(nested)) return;

    const grand = await upsertGraphNode(pool, { type: "nest", title: "Grand nest" });
    const parent = await upsertGraphNode(pool, { type: "nest", title: "Parent nest" });
    const child = await upsertGraphNode(pool, { type: "nest", title: "Child nest" });
    assert.equal(isToolError(grand), false);
    assert.equal(isToolError(parent), false);
    assert.equal(isToolError(child), false);
    if (isToolError(grand) || isToolError(parent) || isToolError(child)) return;

    const hangParent = await linkGraphNodes(pool, {
      from_id: parent.node.id,
      to_id: grand.node.id,
      relation_type: "child_of",
      from_base_updated_at: parent.node.updated_at,
      to_base_updated_at: grand.node.updated_at,
    });
    const hangChild = await linkGraphNodes(pool, {
      from_id: child.node.id,
      to_id: parent.node.id,
      relation_type: "child_of",
      from_base_updated_at: child.node.updated_at,
      to_base_updated_at: parent.node.updated_at,
    });
    assert.equal(isToolError(hangParent), false);
    assert.equal(isToolError(hangChild), false);
    if (isToolError(hangParent) || isToolError(hangChild)) return;

    const freshKeep = await getGraphNode(pool, child.node.id);
    const freshDrop = await getGraphNode(pool, parent.node.id);
    assert.equal(isToolError(freshKeep), false);
    assert.equal(isToolError(freshDrop), false);
    if (isToolError(freshKeep) || isToolError(freshDrop)) return;

    const merged = await mergeGraphNodes(
      pool,
      {
        keep: child.node.id,
        drop: parent.node.id,
        keep_base_updated_at: freshKeep.node.updated_at,
        drop_base_updated_at: freshDrop.node.updated_at,
        confirm: true,
      },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(merged), false);
    if (isToolError(merged)) return;

    const after = await getGraphNode(pool, child.node.id);
    assert.equal(isToolError(after), false);
    if (isToolError(after)) return;
    assert.equal(after.edges.length, 1);
    assert.equal(after.edges[0]?.relation_type, "child_of");
    assert.equal(after.edges[0]?.neighbor.id, grand.node.id);

    const undone = await undoGraphActivity(
      pool,
      { id: merged.activity_id, base_updated_at: after.node.updated_at },
      DESTRUCTIVE,
    );
    assert.equal(isToolError(undone), false);
    if (isToolError(undone)) return;
    const restoredKeep = await getGraphNode(pool, child.node.id);
    const restoredDrop = await getGraphNode(pool, parent.node.id);
    assert.equal(isToolError(restoredKeep), false);
    assert.equal(isToolError(restoredDrop), false);
    if (isToolError(restoredKeep) || isToolError(restoredDrop)) return;
    const keepParent = restoredKeep.edges.find(
      (edge) => edge.relation_type === "child_of" && edge.direction === "out",
    );
    const dropParent = restoredDrop.edges.find(
      (edge) => edge.relation_type === "child_of" && edge.direction === "out",
    );
    assert.equal(keepParent?.neighbor.id, parent.node.id);
    assert.equal(dropParent?.neighbor.id, grand.node.id);
  });
});
