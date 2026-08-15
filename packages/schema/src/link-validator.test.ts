import assert from "node:assert/strict";
import { test } from "node:test";
import { listValidRelationSlugs, validateLink } from "./link-validator.js";
import { SEED_NODE_TYPES } from "./seeds.js";
import type { NodeType } from "./types.js";

const ids = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  c: "33333333-3333-4333-8333-333333333333",
};

test("unknown relation_type lists known slugs", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "serves_value",
    from_type: "project",
    to_type: "area",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Unknown relation_type/);
  assert.match(result.suggestion ?? "", /child_of/);
  assert.match(result.suggestion ?? "", /relates_to/);
});

test("self-link is an error", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.a,
    relation_type: "relates_to",
    from_type: "note",
    to_type: "note",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /itself/);
});

test("exact duplicate is an error", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.b,
      relation_type: "relates_to",
      from_type: "note",
      to_type: "idea",
    },
    {
      existingEdges: [{ from_id: ids.a, to_id: ids.b, relation_type: "relates_to" }],
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Duplicate edge/);
});

test("symmetric duplicate of relates_to is an error", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.b,
      relation_type: "relates_to",
      from_type: "note",
      to_type: "idea",
    },
    {
      existingEdges: [{ from_id: ids.b, to_id: ids.a, relation_type: "relates_to" }],
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Symmetric duplicate/);
});

test("asymmetric reverse of inspired_by is allowed", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.b,
      relation_type: "inspired_by",
      from_type: "note",
      to_type: "idea",
    },
    {
      existingEdges: [{ from_id: ids.b, to_id: ids.a, relation_type: "inspired_by" }],
    },
  );
  assert.equal(result.ok, true);
});

test("matrix miss + suggestion: about requires a person target", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "about",
    from_type: "note",
    to_type: "project",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /target type "project"/);
  assert.match(result.suggestion ?? "", /person/);
});

test("directionality: swapping about (person → note) is suggested", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "about",
    from_type: "person",
    to_type: "note",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.suggestion ?? "", /Swap source and target/);
});

test("child_of uniqueness: at most one parent", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.c,
      relation_type: "child_of",
      from_type: "project",
      to_type: "area",
    },
    {
      existingEdges: [{ from_id: ids.a, to_id: ids.b, relation_type: "child_of" }],
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /already has a child_of parent/);
});

test("child_of rejects types that do not match parent_types", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "child_of",
    from_type: "project",
    to_type: "goal",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /cannot be child_of/);
  assert.match(result.suggestion ?? "", /area/);
});

test("child_of task → project succeeds; task → area is refused; task → goal still works", () => {
  const toProject = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "child_of",
    from_type: "task",
    to_type: "project",
  });
  assert.equal(toProject.ok, true);

  const toGoal = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "child_of",
    from_type: "task",
    to_type: "goal",
  });
  assert.equal(toGoal.ok, true);

  const toArea = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "child_of",
    from_type: "task",
    to_type: "area",
  });
  assert.equal(toArea.ok, false);
  if (toArea.ok) return;
  assert.match(toArea.error, /cannot be child_of/);
  assert.match(toArea.suggestion ?? "", /goal/);
  assert.match(toArea.suggestion ?? "", /project/);
});

test("child_of project → area succeeds", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "child_of",
    from_type: "project",
    to_type: "area",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.relation_type, "child_of");
});

test("relates_to upgrade to child_of when types match and upgrade is true", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "relates_to",
    from_type: "project",
    to_type: "area",
    upgrade: true,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.relation_type, "child_of");
});

test("upgrade still rejects an exact relates_to duplicate", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.b,
      relation_type: "relates_to",
      from_type: "project",
      to_type: "area",
      upgrade: true,
    },
    {
      existingEdges: [{ from_id: ids.a, to_id: ids.b, relation_type: "relates_to" }],
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Duplicate edge/);
});

test("upgrade still rejects a symmetric relates_to duplicate", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.b,
      relation_type: "relates_to",
      from_type: "project",
      to_type: "area",
      upgrade: true,
    },
    {
      existingEdges: [{ from_id: ids.b, to_id: ids.a, relation_type: "relates_to" }],
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /Symmetric duplicate/);
});

test("relates_to does not silently rewrite; it suggests child_of", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "relates_to",
    from_type: "project",
    to_type: "area",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.relation_type, "relates_to");
  assert.match(result.suggestion ?? "", /child_of/);
});

test("listValidRelationSlugs includes child_of for project → area", () => {
  const slugs = listValidRelationSlugs("project", "area");
  assert.ok(slugs.includes("child_of"));
  assert.ok(slugs.includes("relates_to"));
  assert.ok(slugs.includes("supports"));
});

const meeting: NodeType = {
  slug: "meeting",
  label: "Meeting",
  description: "A custom type",
  kind: "artifact",
  parent_types: ["project"],
  json_schema: null,
  is_system: false,
};

test("custom type with parent_types may child_of that parent", () => {
  const result = validateLink(
    {
      from_id: ids.a,
      to_id: ids.b,
      relation_type: "child_of",
      from_type: "meeting",
      to_type: "project",
    },
    { nodeTypes: [...SEED_NODE_TYPES, meeting] },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.relation_type, "child_of");
});

test("types without parent_types still cannot use child_of", () => {
  const result = validateLink({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "child_of",
    from_type: "note",
    to_type: "area",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /cannot be child_of|does not take a hierarchy parent/);
});
