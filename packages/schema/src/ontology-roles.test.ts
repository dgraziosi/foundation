import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import {
  genericAssociativeSlug,
  hasHierarchyParent,
  hierarchySlug,
  hierarchySlugs,
  isHierarchySlug,
  suggestionTargetRelations,
  targetedRelationsForType,
  unconstrainedAssociativeSlugs,
} from "./ontology-roles.js";
import type { NodeType, RelationType } from "./types.js";

test("seed roles come from properties, not a frozen slug list", () => {
  assert.deepEqual(hierarchySlugs(), ["child_of"]);
  assert.equal(hierarchySlug(), "child_of");
  assert.equal(genericAssociativeSlug(), "relates_to");
  assert.ok(unconstrainedAssociativeSlugs().includes("relates_to"));
  assert.ok(unconstrainedAssociativeSlugs().includes("inspired_by"));
  assert.equal(
    targetedRelationsForType("person")
      .map((relation) => relation.slug)
      .includes("about"),
    true,
  );
  assert.deepEqual(
    suggestionTargetRelations().map((relation) => relation.slug),
    ["about"],
  );
});

test("renaming seed slugs keeps roles when properties stay", () => {
  const relations: RelationType[] = SEED_RELATION_TYPES.map((relation) => {
    if (relation.slug === "child_of") {
      return { ...relation, slug: "under" };
    }
    if (relation.slug === "about") {
      return { ...relation, slug: "concerning" };
    }
    if (relation.slug === "relates_to") {
      return { ...relation, slug: "linked_to" };
    }
    if (relation.semantic_parent_slug === "relates_to") {
      return { ...relation, semantic_parent_slug: "linked_to" };
    }
    return relation;
  });
  assert.deepEqual(hierarchySlugs(relations), ["under"]);
  assert.equal(isHierarchySlug("under", relations), true);
  assert.equal(isHierarchySlug("child_of", relations), false);
  assert.equal(genericAssociativeSlug(relations), "linked_to");
  assert.deepEqual(
    suggestionTargetRelations(relations).map((relation) => relation.slug),
    ["concerning"],
  );
  assert.equal(
    hasHierarchyParent(
      "a",
      [{ from_id: "a", relation_type: "under" }],
      relations,
    ),
    true,
  );
  assert.equal(
    hasHierarchyParent(
      "a",
      [{ from_id: "a", relation_type: "child_of" }],
      relations,
    ),
    false,
  );
});

test("widening about target_types adds a suggestion target", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "about"
      ? { ...relation, target_types: ["person", "company"] }
      : relation,
  );
  const about = targetedRelationsForType("company", relations);
  assert.equal(about.length, 1);
  assert.equal(about[0]?.slug, "about");
  assert.ok(suggestionTargetRelations(relations, SEED_NODE_TYPES).some((item) => item.slug === "about"));
});

test("supports stays out of title-match suggestion targets", () => {
  const types: NodeType[] = [...SEED_NODE_TYPES];
  assert.equal(
    suggestionTargetRelations(SEED_RELATION_TYPES, types).some((item) => item.slug === "supports"),
    false,
  );
});
