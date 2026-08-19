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
  assert.ok(slugs.includes("place"));
  assert.ok(slugs.includes("company"));
  assert.ok(slugs.includes("decision"));
  assert.equal(slugs.includes("core_value"), false);
  const place = SEED_NODE_TYPES.find((type) => type.slug === "place");
  const company = SEED_NODE_TYPES.find((type) => type.slug === "company");
  assert.equal(place?.kind, "artifact");
  assert.deepEqual(place?.parent_types, []);
  assert.equal(place?.label, "Place");
  assert.equal(place?.description, "A location (home, office, city, venue, …).");
  assert.equal(place?.is_system, true);
  assert.equal(company?.kind, "artifact");
  assert.equal(company?.is_system, true);
  const task = SEED_NODE_TYPES.find((type) => type.slug === "task");
  const goal = SEED_NODE_TYPES.find((type) => type.slug === "goal");
  assert.deepEqual(task?.parent_types, ["goal", "project"]);
  assert.match(task?.description ?? "", /Prefer child_of a goal/);
  assert.match(task?.description ?? "", /child_of a project is allowed/);
  const dueSchema = task?.json_schema as {
    properties?: { due?: { anyOf?: Array<{ pattern?: string; type?: string }> } };
    additionalProperties?: boolean;
    required?: unknown;
  } | null;
  assert.ok(
    dueSchema?.properties?.due?.anyOf?.some((item) => item.pattern === "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
  );
  assert.ok(dueSchema?.properties?.due?.anyOf?.some((item) => item.type === "null"));
  assert.equal(dueSchema?.additionalProperties, true);
  assert.equal(dueSchema?.required, undefined);
  assert.deepEqual(task?.json_schema, goal?.json_schema);
  assert.equal(SEED_NODE_TYPES.find((type) => type.slug === "note")?.json_schema, null);
  assert.deepEqual(task?.fields?.map((field) => field.name), ["due"]);
  assert.deepEqual(
    task?.views?.map((view) => view.id),
    ["board", "list", "calendar", "timeline", "outline"],
  );
  assert.equal(task?.default_view, "board");
  assert.deepEqual(SEED_NODE_TYPES.find((type) => type.slug === "note")?.views?.map((view) => view.id), [
    "list",
  ]);
  assert.equal(SEED_NODE_TYPES.find((type) => type.slug === "note")?.default_view, "list");
  assert.deepEqual(goal?.views?.map((view) => view.id), ["list", "calendar", "timeline", "outline"]);
  const trip = SEED_NODE_TYPES.find((type) => type.slug === "trip");
  assert.deepEqual(trip?.fields?.map((field) => field.name), ["start", "end", "place"]);
  assert.deepEqual(trip?.views?.map((view) => view.id), ["list", "calendar", "timeline"]);
  const person = SEED_NODE_TYPES.find((type) => type.slug === "person");
  assert.deepEqual(person?.fields?.map((field) => field.name), ["org"]);
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
  assert.deepEqual(childOf?.source_types, []);
  assert.deepEqual(childOf?.target_types, []);
  const relatesTo = SEED_RELATION_TYPES.find((type) => type.slug === "relates_to");
  assert.equal(relatesTo?.is_symmetric, true);
});
