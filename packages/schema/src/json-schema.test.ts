import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDataAgainstJsonSchema } from "./json-schema.js";

const requiredName = {
  type: "object",
  additionalProperties: true,
  required: ["name"],
  properties: { name: { type: "string", minLength: 1 } },
};

test("null or omitted json_schema skips validation", () => {
  assert.equal(validateDataAgainstJsonSchema({}, null, "note"), null);
  assert.equal(validateDataAgainstJsonSchema({}, undefined, "note"), null);
  assert.equal(validateDataAgainstJsonSchema({ extra: 1 }, true, "note"), null);
});

test("schema miss returns error and suggestion", () => {
  const miss = validateDataAgainstJsonSchema({}, requiredName, "company");
  assert.ok(miss);
  assert.match(miss.error, /does not match json_schema for type "company"/);
  assert.match(miss.suggestion ?? "", /inspect_ontology/);
});

test("matching data passes", () => {
  assert.equal(
    validateDataAgainstJsonSchema({ name: "Acme" }, requiredName, "company"),
    null,
  );
});

test("invalid stored schema returns error", () => {
  const err = validateDataAgainstJsonSchema({}, "not-a-schema", "task");
  assert.ok(err);
  assert.match(err.error, /invalid json_schema/);
});
