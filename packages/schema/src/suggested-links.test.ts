import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import {
  ABOUT_SUGGESTION_REASON,
  CHILD_OF_SUGGESTION_REASON,
  RELATES_TO_SUGGESTION_REASON,
  SUGGESTED_LINKS_CAP,
  classifySuggestedLinks,
} from "./suggested-links.js";

function seedType(slug: string) {
  const type = SEED_NODE_TYPES.find((item) => item.slug === slug);
  assert.ok(type);
  return type;
}

const project = { id: "11111111-1111-4111-8111-111111111111", type: "project", title: "Kitchen remodel" };
const person = { id: "22222222-2222-4222-8222-222222222222", type: "person", title: "Jordan Lee" };
const note = { id: "33333333-3333-4333-8333-333333333333", type: "note", title: "Kitchen remodel" };
const self = { id: "44444444-4444-4444-8444-444444444444", type: "task", title: "Kitchen remodel" };

test("task matching an allowed parent is child_of, not relates_to", () => {
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [project, note]);
  assert.deepEqual(suggestions, [
    {
      kind: "child_of",
      target: project,
      reason: CHILD_OF_SUGGESTION_REASON,
    },
  ]);
});

test("title that looks like a person is about", () => {
  const suggestions = classifySuggestedLinks(self.id, seedType("note"), [person]);
  assert.deepEqual(suggestions, [
    {
      kind: "about",
      target: person,
      reason: ABOUT_SUGGESTION_REASON,
    },
  ]);
});

test("otherwise a close title match is relates_to", () => {
  const suggestions = classifySuggestedLinks(self.id, seedType("note"), [note]);
  assert.deepEqual(suggestions, [
    {
      kind: "relates_to",
      target: note,
      reason: RELATES_TO_SUGGESTION_REASON,
    },
  ]);
});

test("suggestions never include the source node", () => {
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [self, project]);
  assert.equal(suggestions.some((item) => item.target.id === self.id), false);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.target.id, project.id);
});

test("empty candidates yield no suggestions", () => {
  assert.deepEqual(classifySuggestedLinks(self.id, seedType("task"), []), []);
});

test("spine types without parent_types do not invent child_of", () => {
  const suggestions = classifySuggestedLinks(self.id, seedType("area"), [project]);
  assert.deepEqual(suggestions, [
    {
      kind: "relates_to",
      target: project,
      reason: RELATES_TO_SUGGESTION_REASON,
    },
  ]);
});

test("child_of and about can both appear; relates_to stays a fallback", () => {
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [person, project, note]);
  assert.deepEqual(
    suggestions.map((item) => item.kind),
    ["child_of", "about"],
  );
  assert.equal(suggestions[0]?.target.id, project.id);
  assert.equal(suggestions[1]?.target.id, person.id);
});

test("already has a live child_of: do not suggest a second parent", () => {
  const other = {
    id: "66666666-6666-4666-8666-666666666666",
    type: "project",
    title: "Bathroom remodel",
  };
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [other, person], {
    hasHierarchyParent: true,
  });
  assert.equal(suggestions.some((item) => item.kind === "child_of"), false);
  assert.deepEqual(suggestions, [
    {
      kind: "about",
      target: person,
      reason: ABOUT_SUGGESTION_REASON,
    },
  ]);
});

test("restricted about source_types does not suggest from a disallowed source", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "about" ? { ...relation, source_types: ["note"] } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [person], {
    relationTypes: relations,
  });
  assert.equal(suggestions.some((item) => item.kind === "about"), false);
  assert.deepEqual(suggestions, [
    {
      kind: "relates_to",
      target: person,
      reason: RELATES_TO_SUGGESTION_REASON,
    },
  ]);
});

test("allowed about source_types still suggests about", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "about" ? { ...relation, source_types: ["note"] } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("note"), [person], {
    relationTypes: relations,
  });
  assert.deepEqual(suggestions, [
    {
      kind: "about",
      target: person,
      reason: ABOUT_SUGGESTION_REASON,
    },
  ]);
});

test("restricted child_of source_types does not suggest a parent from a disallowed source", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "child_of" ? { ...relation, source_types: ["goal"] } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [project], {
    relationTypes: relations,
  });
  assert.equal(suggestions.some((item) => item.kind === "child_of"), false);
  assert.deepEqual(suggestions, [
    {
      kind: "relates_to",
      target: project,
      reason: RELATES_TO_SUGGESTION_REASON,
    },
  ]);
});

test("restricted child_of target_types does not suggest a parent the validator would refuse", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "child_of" ? { ...relation, target_types: ["area"] } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [project], {
    relationTypes: relations,
  });
  assert.equal(suggestions.some((item) => item.kind === "child_of"), false);
  assert.deepEqual(suggestions, [
    {
      kind: "relates_to",
      target: project,
      reason: RELATES_TO_SUGGESTION_REASON,
    },
  ]);
});

test("allowed child_of target_types still suggests a parent", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "child_of" ? { ...relation, target_types: ["project"] } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [project], {
    relationTypes: relations,
  });
  assert.deepEqual(suggestions, [
    {
      kind: "child_of",
      target: project,
      reason: CHILD_OF_SUGGESTION_REASON,
    },
  ]);
});

test("changing about target_types suggests that type", () => {
  const company = {
    id: "77777777-7777-4777-8777-777777777777",
    type: "company",
    title: "Fixture Co",
  };
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "about" ? { ...relation, target_types: ["person", "company"] } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("note"), [company], {
    relationTypes: relations,
  });
  assert.deepEqual(suggestions, [
    {
      kind: "about",
      target: company,
      reason: ABOUT_SUGGESTION_REASON,
    },
  ]);
});

test("renamed hierarchy slug still suggests a parent", () => {
  const relations = SEED_RELATION_TYPES.map((relation) =>
    relation.slug === "child_of" ? { ...relation, slug: "under" } : relation,
  );
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), [project], {
    relationTypes: relations,
  });
  assert.equal(suggestions[0]?.kind, "under");
  assert.equal(suggestions[0]?.target.id, project.id);
});

test("suggestions cap at 5", () => {
  const extras = Array.from({ length: 8 }, (_, index) => ({
    id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
    type: "project",
    title: `Project ${index}`,
  }));
  const suggestions = classifySuggestedLinks(self.id, seedType("task"), extras);
  assert.equal(suggestions.length, SUGGESTED_LINKS_CAP);
  assert.ok(suggestions.every((item) => item.kind === "child_of"));
});
