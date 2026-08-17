import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREATE_DUPLICATE_SUGGESTION,
  CREATE_SIMILAR_WARNING,
  LOOKUP_AMBIGUOUS_SUGGESTION,
  LOOKUP_CANDIDATE_SUGGESTION,
  classifyLookupResult,
  createPreflightFromLookup,
} from "./lookup-classify.js";

const person = (id: string, title: string) => ({
  id,
  type: "person",
  title,
  status: "active" as const,
  updated_at: "2026-08-17T00:00:00.000Z",
});

test("unique title exact is exact; unique alias is alias", () => {
  const exact = classifyLookupResult(
    { name: "Priya Shah", type: "person" },
    [{ ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 1, match: "title_exact", matched_value: "Priya Shah" }],
    5,
  );
  assert.equal(exact.outcome, "exact");
  assert.equal(exact.candidates.length, 1);
  assert.equal(exact.candidates[0]?.updated_at, "2026-08-17T00:00:00.000Z");
  assert.equal(exact.candidates[0]?.confidence, 1);

  const alias = classifyLookupResult(
    { name: "Pree-uh", type: "person" },
    [{ ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 0.99, match: "alias_exact", matched_value: "Pree-uh" }],
    5,
  );
  assert.equal(alias.outcome, "alias");
});

test("token and fuzzy never become exact or alias", () => {
  const token = classifyLookupResult(
    { name: "Priya", type: "person" },
    [{ ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 0.66, match: "title_token", matched_value: "Priya Shah" }],
    5,
  );
  assert.equal(token.outcome, "candidate");
  assert.equal(token.suggestion, LOOKUP_CANDIDATE_SUGGESTION);
  assert.match(token.candidates[0]?.explanation ?? "", /ranking field, not a probability/);
  assert.equal(token.candidates[0]?.explanation.includes("likely"), false);

  const fuzzy = classifyLookupResult(
    { name: "Jorden Hale", type: "person" },
    [{ ...person("22222222-2222-4222-8222-222222222222", "Jordan Hale"), confidence: 0.72, match: "title_fuzzy", matched_value: "Jordan Hale" }],
    5,
  );
  assert.equal(fuzzy.outcome, "candidate");
  assert.match(fuzzy.suggestion ?? "", /confirm which UUID/);
});

test("duplicate titles and alias/title collisions are ambiguous", () => {
  const dup = classifyLookupResult(
    { name: "Alex Rivera", type: "person" },
    [
      { ...person("33333333-3333-4333-8333-333333333333", "Alex Rivera"), confidence: 1, match: "title_exact", matched_value: "Alex Rivera" },
      { ...person("44444444-4444-4444-8444-444444444444", "Alex Rivera"), confidence: 1, match: "title_exact", matched_value: "Alex Rivera" },
    ],
    5,
  );
  assert.equal(dup.outcome, "ambiguous");
  assert.equal(dup.candidates.length, 2);
  assert.equal(dup.suggestion, LOOKUP_AMBIGUOUS_SUGGESTION);

  const collision = classifyLookupResult(
    { name: "Priya Shah", type: "person" },
    [
      { ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 1, match: "title_exact", matched_value: "Priya Shah" },
      { ...person("55555555-5555-4555-8555-555555555555", "Sam Ortega"), confidence: 0.99, match: "alias_exact", matched_value: "Priya Shah" },
    ],
    5,
  );
  assert.equal(collision.outcome, "ambiguous");
});

test("deterministic ties sort by confidence, title, then id", () => {
  const first = classifyLookupResult(
    { name: "Sam", type: "person" },
    [
      { ...person("99999999-9999-4999-8999-999999999999", "Sam Ortega"), confidence: 0.66, match: "title_token", matched_value: "Sam Ortega" },
      { ...person("11111111-1111-4111-8111-111111111111", "Sam Oakley"), confidence: 0.66, match: "title_token", matched_value: "Sam Oakley" },
    ],
    5,
  );
  const second = classifyLookupResult(
    { name: "Sam", type: "person" },
    [
      { ...person("11111111-1111-4111-8111-111111111111", "Sam Oakley"), confidence: 0.66, match: "title_token", matched_value: "Sam Oakley" },
      { ...person("99999999-9999-4999-8999-999999999999", "Sam Ortega"), confidence: 0.66, match: "title_token", matched_value: "Sam Ortega" },
    ],
    5,
  );
  assert.deepEqual(
    first.candidates.map((row) => row.id),
    second.candidates.map((row) => row.id),
  );
  assert.equal(first.candidates[0]?.title, "Sam Oakley");
  assert.equal(first.candidates[1]?.title, "Sam Ortega");
});

test("exact title wins over weaker matches on the same node", () => {
  const result = classifyLookupResult(
    { name: "Priya Shah", type: "person" },
    [
      { ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 1, match: "title_exact", matched_value: "Priya Shah" },
      { ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 0.7, match: "title_fuzzy", matched_value: "Priya Shah" },
    ],
    5,
  );
  assert.equal(result.outcome, "exact");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.match, "title_exact");
});

test("create preflight blocks exact/alias and warns on fuzzy", () => {
  const exact = classifyLookupResult(
    { name: "Priya Shah", type: "person" },
    [{ ...person("11111111-1111-4111-8111-111111111111", "Priya Shah"), confidence: 1, match: "title_exact", matched_value: "Priya Shah" }],
    5,
  );
  const blocked = createPreflightFromLookup(exact);
  assert.equal(blocked.action, "block");
  if (blocked.action === "block") {
    assert.equal(blocked.error.error, "duplicate_candidates");
    assert.equal(blocked.error.outcome, "exact");
    assert.equal(blocked.error.suggestion, CREATE_DUPLICATE_SUGGESTION);
    assert.equal(blocked.error.candidates[0]?.id, "11111111-1111-4111-8111-111111111111");
  }

  const fuzzy = classifyLookupResult(
    { name: "Jorden Hale", type: "person" },
    [{ ...person("22222222-2222-4222-8222-222222222222", "Jordan Hale"), confidence: 0.72, match: "title_fuzzy", matched_value: "Jordan Hale" }],
    5,
  );
  const warned = createPreflightFromLookup(fuzzy);
  assert.equal(warned.action, "warn");
  if (warned.action === "warn") {
    assert.equal(warned.warning.suggestion, CREATE_SIMILAR_WARNING);
    assert.equal(warned.warning.outcome, "candidate");
  }

  const miss = classifyLookupResult({ name: "No such person xyz", type: "person" }, [], 5);
  assert.equal(createPreflightFromLookup(miss).action, "ok");
});
