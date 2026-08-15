import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DATA_EQUALS_MAX_KEYS,
  DataEqualsSchema,
  hasDataEqualsFilter,
  matchesDataEquals,
} from "./data-equals.js";

test("data_equals accepts one or a few identifier keys", () => {
  const parsed = DataEqualsSchema.parse({ kind: "fixture_alpha", status: "potential" });
  assert.deepEqual(parsed, { kind: "fixture_alpha", status: "potential" });
  DataEqualsSchema.parse({});
  assert.throws(() => DataEqualsSchema.parse({ "Kind": "x" }));
  assert.throws(() => DataEqualsSchema.parse({ "data.kind": "x" }));
  assert.throws(() => DataEqualsSchema.parse({ kind: "" }));
  const tooMany: Record<string, string> = {};
  for (let i = 0; i < DATA_EQUALS_MAX_KEYS + 1; i += 1) {
    tooMany[`k${i}`] = "v";
  }
  assert.throws(() => DataEqualsSchema.parse(tooMany));
});

test("empty data_equals is not a selector; missing keys do not match", () => {
  assert.equal(hasDataEqualsFilter(undefined), false);
  assert.equal(hasDataEqualsFilter({}), false);
  assert.equal(hasDataEqualsFilter({ kind: "fixture_alpha" }), true);
  assert.equal(matchesDataEquals({ kind: "fixture_alpha" }, undefined), true);
  assert.equal(matchesDataEquals({ kind: "fixture_alpha" }, {}), true);
  assert.equal(matchesDataEquals({ kind: "fixture_alpha" }, { kind: "fixture_alpha" }), true);
  assert.equal(matchesDataEquals({ kind: "fixture_beta" }, { kind: "fixture_alpha" }), false);
  assert.equal(matchesDataEquals({}, { kind: "fixture_alpha" }), false);
  assert.equal(
    matchesDataEquals({ kind: "fixture_alpha" }, { kind: "fixture_alpha", status: "potential" }),
    false,
  );
  assert.equal(
    matchesDataEquals(
      { kind: "fixture_alpha", status: "potential" },
      { kind: "fixture_alpha", status: "potential" },
    ),
    true,
  );
});
