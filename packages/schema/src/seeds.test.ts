import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTIFACT_TYPE_SLUGS,
  SEED_NODE_TYPES,
  SEED_RELATION_TYPES,
  SPINE_DIAGRAM,
  SPINE_TYPE_SLUGS,
} from "./seeds.js";
import { NodeTypeSchema, RelationTypeSchema } from "./types.js";

test("spine diagram matches area → project → goal → habit | task", () => {
  assert.equal(SPINE_DIAGRAM, "area → project → goal → habit | task");
});

test("seed node types parse and include spine plus artifacts", () => {
  for (const type of SEED_NODE_TYPES) {
    NodeTypeSchema.parse(type);
    assert.equal(type.is_system, true);
  }
  const slugs = SEED_NODE_TYPES.map((type) => type.slug);
  for (const slug of SPINE_TYPE_SLUGS) {
    assert.ok(slugs.includes(slug), `missing spine type ${slug}`);
  }
  for (const slug of ARTIFACT_TYPE_SLUGS) {
    assert.ok(slugs.includes(slug), `missing artifact type ${slug}`);
  }
  assert.equal(slugs.includes("core_value"), false);
});

test("seed relations include child_of and associative verbs", () => {
  const slugs = SEED_RELATION_TYPES.map((type) => type.slug);
  for (const slug of ["child_of", "relates_to", "supports", "inspired_by", "references", "about"]) {
    assert.ok(slugs.includes(slug), `missing relation ${slug}`);
  }
  for (const type of SEED_RELATION_TYPES) {
    RelationTypeSchema.parse(type);
    assert.equal(type.is_system, true);
  }
  const childOf = SEED_RELATION_TYPES.find((type) => type.slug === "child_of");
  assert.equal(childOf?.kind, "hierarchy");
  assert.equal(childOf?.is_symmetric, false);
  const relatesTo = SEED_RELATION_TYPES.find((type) => type.slug === "relates_to");
  assert.equal(relatesTo?.is_symmetric, true);
});
