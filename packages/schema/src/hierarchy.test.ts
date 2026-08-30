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
  assert.equal(canChildOf("habit", "goal"), true);
  assert.equal(canChildOf("habit", "project"), false);
  assert.equal(canChildOf("habit", "area"), false);
  assert.equal(requiresHierarchyParent("habit"), false);
  assert.deepEqual(getParentTypes("task"), ["goal", "project"]);
  assert.equal(getParentType("task"), undefined);
  assert.equal(canChildOf("task", "goal"), true);
  assert.equal(canChildOf("task", "project"), true);
  assert.equal(canChildOf("task", "area"), false);
  assert.equal(requiresHierarchyParent("task"), false);
  assert.equal(getParentType("area"), undefined);
});

test("habit does not need a goal parent", () => {
  assert.deepEqual(getParentTypes("habit"), ["goal"]);
  assert.equal(requiresHierarchyParent("habit"), false);
  assert.equal(canChildOf("habit", "goal"), true);
  assert.equal(canChildOf("habit", "area"), false);
});

test("lesson may hang under area, project, or goal", () => {
  assert.deepEqual(getParentTypes("lesson"), ["area", "project", "goal"]);
  assert.equal(canChildOf("lesson", "area"), true);
  assert.equal(canChildOf("lesson", "project"), true);
  assert.equal(canChildOf("lesson", "goal"), true);
  assert.equal(canChildOf("lesson", "habit"), false);
  assert.equal(getParentType("lesson"), undefined);
  assert.equal(requiresHierarchyParent("lesson"), false);
});

test("artifacts without parent_types do not require a parent", () => {
  for (const slug of ARTIFACT_TYPE_SLUGS) {
    assert.equal(requiresHierarchyParent(slug), false);
    assert.equal(isArtifactType(slug), true);
  }
});

test("decision may hang under area, project, or goal", () => {
  assert.deepEqual(getParentTypes("decision"), ["area", "project", "goal"]);
  assert.equal(canChildOf("decision", "area"), true);
  assert.equal(canChildOf("decision", "habit"), false);
  assert.equal(requiresHierarchyParent("decision"), false);
});

test("spend may child_of a project only; a parent is not required", () => {
  assert.deepEqual(getParentTypes("spend"), ["project"]);
  assert.equal(canChildOf("spend", "project"), true);
  assert.equal(canChildOf("spend", "area"), false);
  assert.equal(canChildOf("spend", "goal"), false);
  assert.equal(requiresHierarchyParent("spend"), false);
  assert.equal(isArtifactType("spend"), true);
});

test("area is the spine root", () => {
  assert.equal(isSpineType("area"), true);
  assert.equal(requiresHierarchyParent("area"), false);
  assert.equal(
    SEED_NODE_TYPES.find((type) => type.slug === "area")?.parent_types.length,
    0,
  );
});
