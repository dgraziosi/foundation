import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import {
  assertSystemRelationPatch,
  assertSystemTypePatch,
  labelFromSlug,
  missingConfirm,
} from "./ontology-mutation.js";

const area = SEED_NODE_TYPES.find((type) => type.slug === "area");
assert.ok(area);
const childOf = SEED_RELATION_TYPES.find((type) => type.slug === "child_of");
assert.ok(childOf);

test("labelFromSlug title-cases the first letter", () => {
  assert.equal(labelFromSlug("meeting"), "Meeting");
  assert.equal(labelFromSlug("code_review"), "Code review");
});

test("system types may update description (no locked-field changes)", () => {
  assert.equal(assertSystemTypePatch(area, {}), null);
  assert.equal(assertSystemTypePatch(area, { kind: "spine", label: "Area" }), null);
});

test("system types refuse kind/label/parent_types/json_schema/views edits", () => {
  const err = assertSystemTypePatch(area, { kind: "artifact", parent_types: ["project"] });
  assert.ok(err);
  assert.match(err.error, /Cannot change system type "area"/);
  assert.match(err.error, /kind/);
  assert.match(err.error, /parent_types/);
  assert.match(err.suggestion ?? "", /description/);
  const viewsErr = assertSystemTypePatch(area, { views: ["card"], default_view: "card" });
  assert.ok(viewsErr);
  assert.match(viewsErr.error, /views/);
});

test("non-system types are not locked", () => {
  assert.equal(
    assertSystemTypePatch(
      { ...area, slug: "meeting", is_system: false },
      { kind: "spine", parent_types: ["area"] },
    ),
    null,
  );
});

test("system relations refuse constraint edits", () => {
  const err = assertSystemRelationPatch(childOf, { source_types: ["note"] });
  assert.ok(err);
  assert.match(err.error, /Cannot change system relation "child_of"/);
});

test("missingConfirm requires confirm: true", () => {
  assert.ok(missingConfirm("delete", undefined));
  assert.ok(missingConfirm("delete", false));
  assert.equal(missingConfirm("delete", true), null);
  assert.match(missingConfirm("unlink", false)?.error ?? "", /unlink requires confirm: true/);
});
