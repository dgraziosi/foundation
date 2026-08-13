import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canChildOf,
  getParentType,
  getParentTypes,
  isArtifactType,
  isSpineType,
  requiresHierarchyParent,
} from "./hierarchy.js";
import { ARTIFACT_TYPE_SLUGS, SEED_NODE_TYPES } from "./seeds.js";

test("getParentType(project) === area", () => {
  assert.equal(getParentType("project"), "area");
});

test("spine parent chain", () => {
  assert.equal(getParentType("goal"), "project");
  assert.equal(getParentType("habit"), "goal");
  assert.equal(getParentType("task"), "goal");
  assert.equal(getParentType("area"), undefined);
});

test("lesson may hang under area, project, or goal", () => {
  assert.deepEqual(getParentTypes("lesson"), ["area", "project", "goal"]);
  assert.equal(canChildOf("lesson", "area"), true);
  assert.equal(canChildOf("lesson", "project"), true);
  assert.equal(canChildOf("lesson", "goal"), true);
  assert.equal(canChildOf("lesson", "habit"), false);
  assert.equal(getParentType("lesson"), undefined);
});

test("artifacts without parent_types do not require a parent", () => {
  for (const slug of ARTIFACT_TYPE_SLUGS) {
    if (slug === "lesson" || slug === "decision") {
      assert.equal(requiresHierarchyParent(slug), true);
      continue;
    }
    assert.equal(requiresHierarchyParent(slug), false);
    assert.equal(isArtifactType(slug), true);
  }
});

test("decision may hang under area, project, or goal", () => {
  assert.deepEqual(getParentTypes("decision"), ["area", "project", "goal"]);
  assert.equal(canChildOf("decision", "area"), true);
  assert.equal(canChildOf("decision", "habit"), false);
});

test("area is the spine root", () => {
  assert.equal(isSpineType("area"), true);
  assert.equal(requiresHierarchyParent("area"), false);
  assert.equal(
    SEED_NODE_TYPES.find((type) => type.slug === "area")?.parent_types.length,
    0,
  );
});
