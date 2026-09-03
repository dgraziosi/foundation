import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import {
  assertSystemRelationPatch,
  assertSystemTypePatch,
  labelFromSlug,
  missingDestructive,
} from "./ontology-mutation.js";
import { SEED_TYPE_VIEWS } from "./views.js";

const area = SEED_NODE_TYPES.find((type) => type.slug === "area");
assert.ok(area);
const task = SEED_NODE_TYPES.find((type) => type.slug === "task");
assert.ok(task);
const childOf = SEED_RELATION_TYPES.find((type) => type.slug === "child_of");
assert.ok(childOf);

test("labelFromSlug title-cases the first letter", () => {
  assert.equal(labelFromSlug("meeting"), "Meeting");
  assert.equal(labelFromSlug("code_review"), "Code review");
});

test("system types may update description, fields, and view queries", () => {
  assert.equal(assertSystemTypePatch(area, {}), null);
  assert.equal(assertSystemTypePatch(area, { kind: "spine", label: "Area" }), null);
  const query = SEED_TYPE_VIEWS.task.views.map((view) =>
    view.id === "board"
      ? { ...view, filter: { clauses: [{ bind: "status" as const, op: "in" as const, value: ["active", "completed"] }] } }
      : view,
  );
  assert.equal(assertSystemTypePatch(task, { views: query }), null);
  assert.equal(
    assertSystemTypePatch(task, {
      fields: [...(task.fields ?? []), { name: "note", display: "Note", kind: "string", needed: false }],
    }),
    null,
  );
});

test("system types refuse kind/label/parent_types/json_schema/view-id/slug edits", () => {
  const err = assertSystemTypePatch(area, { kind: "artifact", parent_types: ["project"] });
  assert.ok(err);
  assert.match(err.error, /Cannot change system type "area"/);
  assert.match(err.error, /kind/);
  assert.match(err.error, /parent_types/);
  const viewsErr = assertSystemTypePatch(area, { views: ["card"], default_view: "card" });
  assert.ok(viewsErr);
  assert.match(viewsErr.error, /views/);
  const addGraph = assertSystemTypePatch(task, {
    views: [...SEED_TYPE_VIEWS.task.views, { id: "graph" }],
  });
  assert.ok(addGraph);
  assert.match(addGraph.error, /views/);
  const dropBoard = assertSystemTypePatch(task, {
    views: SEED_TYPE_VIEWS.task.views.filter((view) => view.id !== "board"),
  });
  assert.ok(dropBoard);
  assert.match(dropBoard.error, /views/);
  const slugErr = assertSystemTypePatch(task, { slug: "jobs" });
  assert.ok(slugErr);
  assert.match(slugErr.error, /slug/);
  const newEngineDefault = assertSystemTypePatch(task, { default_view: "graph" });
  assert.ok(newEngineDefault);
  assert.match(newEngineDefault.error, /default_view/);
});

test("non-system types are not locked", () => {
  assert.equal(
    assertSystemTypePatch(
      { ...area, slug: "meeting", is_system: false },
      { kind: "spine", parent_types: ["area"], views: [{ id: "graph" }] },
    ),
    null,
  );
});

test("system relations may edit source_types and target_types", () => {
  assert.equal(assertSystemRelationPatch(childOf, { source_types: ["note"] }), null);
  assert.equal(assertSystemRelationPatch(childOf, { target_types: ["area"] }), null);
});

test("system relations refuse kind, label, and symmetry edits", () => {
  const err = assertSystemRelationPatch(childOf, { kind: "associative", label: "Under" });
  assert.ok(err);
  assert.match(err.error, /Cannot change system relation "child_of"/);
  assert.match(err.error, /kind/);
  assert.match(err.error, /label/);
});

test("missingDestructive requires destructive scope", () => {
  assert.ok(missingDestructive("delete", undefined));
  assert.ok(missingDestructive("delete", false));
  assert.equal(missingDestructive("delete", true), null);
  assert.match(missingDestructive("unlink", false)?.error ?? "", /unlink needs a key with destructive scope/);
});
