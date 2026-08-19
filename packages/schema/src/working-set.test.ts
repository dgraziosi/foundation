import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import {
  addIsoDays,
  applyWorkingSetCap,
  compareWorkingSetItems,
  datesFromNodeData,
  planWorkingSetWalk,
  preferWorkRelation,
  workItemPassesSpineRootWindow,
} from "./working-set.js";

function seedType(slug: string) {
  const type = SEED_NODE_TYPES.find((item) => item.slug === slug);
  assert.ok(type);
  return type;
}

test("planWorkingSetWalk: goal and project are children; area is spine root", () => {
  const goal = planWorkingSetWalk(seedType("goal"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(goal.work, "children");
  assert.equal(goal.ancestors, true);
  assert.ok(goal.workRelations.includes("child_of"));
  assert.equal(goal.isSpineRoot, false);

  const project = planWorkingSetWalk(seedType("project"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(project.work, "children");
  assert.equal(project.ancestors, true);

  const area = planWorkingSetWalk(seedType("area"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(area.work, "children");
  assert.equal(area.ancestors, false);
  assert.equal(area.isSpineRoot, true);
});

test("planWorkingSetWalk: person is about, not children", () => {
  const person = planWorkingSetWalk(seedType("person"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(person.work, "about");
  assert.equal(person.ancestors, false);
  assert.ok(person.workRelations.includes("about"));
  assert.ok(person.workRelations.includes("relates_to"));
  assert.equal(person.workRelations.includes("child_of"), false);
  assert.ok(person.incomingOnlyRelations.includes("about"));
});

test("planWorkingSetWalk: trip is event; task is leaf with ancestors", () => {
  const trip = planWorkingSetWalk(seedType("trip"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(trip.work, "event");
  assert.ok(trip.workRelations.includes("relates_to"));
  assert.ok(trip.workRelations.includes("supports"));

  const task = planWorkingSetWalk(seedType("task"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(task.work, "none");
  assert.equal(task.ancestors, true);
});

test("datesFromNodeData reads date and start/end roles", () => {
  const task = datesFromNodeData({ due: "2026-08-20" }, seedType("task"));
  assert.deepEqual(task, { due: "2026-08-20" });
  const trip = datesFromNodeData({ start: "2026-09-01", end: "2026-09-08" }, seedType("trip"));
  assert.equal(trip.start, "2026-09-01");
  assert.equal(trip.end, "2026-09-08");
  assert.equal(trip.due, undefined);
});

test("compareWorkingSetItems: parents first, then overdue, upcoming, undated", () => {
  const today = "2026-08-19";
  const parent = {
    role: "parent" as const,
    title: "Ship",
    via: { hops: 1 },
  };
  const overdue = {
    role: "work" as const,
    title: "Late",
    due: "2026-08-01",
    via: { hops: 1 },
  };
  const upcoming = {
    role: "work" as const,
    title: "Soon",
    due: "2026-08-25",
    via: { hops: 1 },
  };
  const undated = { role: "work" as const, title: "Later", via: { hops: 1 } };
  const items = [undated, upcoming, parent, overdue];
  items.sort((a, b) => compareWorkingSetItems(a, b, today));
  assert.deepEqual(
    items.map((item) => item.title),
    ["Ship", "Late", "Soon", "Later"],
  );
});

test("spine-root window keeps overdue, in-window, and undated depth-1", () => {
  const today = "2026-08-19";
  assert.equal(
    workItemPassesSpineRootWindow({ sortDate: "2026-08-01", hops: 2, today, dueWithinDays: 14 }),
    true,
  );
  assert.equal(
    workItemPassesSpineRootWindow({ sortDate: "2026-08-25", hops: 2, today, dueWithinDays: 14 }),
    true,
  );
  assert.equal(
    workItemPassesSpineRootWindow({ sortDate: "2026-09-20", hops: 2, today, dueWithinDays: 14 }),
    false,
  );
  assert.equal(
    workItemPassesSpineRootWindow({ hops: 1, today, dueWithinDays: 14 }),
    true,
  );
  assert.equal(
    workItemPassesSpineRootWindow({ hops: 2, today, dueWithinDays: 14 }),
    false,
  );
  assert.equal(addIsoDays("2026-08-19", 14), "2026-09-02");
});

test("preferWorkRelation: about and supports beat relates_to", () => {
  const person = planWorkingSetWalk(seedType("person"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(preferWorkRelation("about", "relates_to", person), "about");
  assert.equal(preferWorkRelation("relates_to", "about", person), "about");
  const trip = planWorkingSetWalk(seedType("trip"), SEED_NODE_TYPES, SEED_RELATION_TYPES);
  assert.equal(preferWorkRelation("supports", "relates_to", trip), "supports");
});

test("applyWorkingSetCap keeps parents then work and flags truncated", () => {
  const parents = [{ role: "parent" as const, title: "Goal", via: { hops: 1 } }];
  const work = Array.from({ length: 5 }, (_, index) => ({
    role: "work" as const,
    title: `T${index}`,
    via: { hops: 1 },
  }));
  const capped = applyWorkingSetCap([...parents, ...work], 3);
  assert.equal(capped.items.length, 3);
  assert.equal(capped.items[0]?.role, "parent");
  assert.equal(capped.truncated, true);
  const full = applyWorkingSetCap([...parents, ...work], 40);
  assert.equal(full.truncated, false);
  assert.equal(full.items.length, 6);
});
