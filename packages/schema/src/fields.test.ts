import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compileJsonSchemaFromFields,
  parseTypeFieldsInput,
  validateDataAgainstJsonSchema,
} from "./index.js";

test("field parse: unique names, role uniqueness, enum and ref rules", () => {
  const ok = parseTypeFieldsInput([
    { name: "due", kind: "date", role: "date" },
    { name: "org", kind: "string", role: "subtitle" },
  ]);
  assert.equal(ok.ok, true);
  if (!ok.ok) {
    return;
  }
  assert.equal(ok.fields[0]?.display, "Due");
  assert.equal(ok.fields[0]?.needed, false);

  assert.equal(parseTypeFieldsInput([{ name: "Due", kind: "string" }]).ok, false);
  assert.equal(
    parseTypeFieldsInput([
      { name: "a", kind: "date", role: "date" },
      { name: "b", kind: "date", role: "date" },
    ]).ok,
    false,
  );
  assert.equal(parseTypeFieldsInput([{ name: "status", kind: "string", role: "status" }]).ok, false);
  assert.equal(parseTypeFieldsInput([{ name: "when", kind: "string", role: "date" }]).ok, false);
  assert.equal(parseTypeFieldsInput([{ name: "end", kind: "date", role: "end" }]).ok, false);
  assert.equal(parseTypeFieldsInput([{ name: "kind", kind: "enum" }]).ok, false);
  assert.equal(parseTypeFieldsInput([{ name: "owner", kind: "ref" }]).ok, false);
  const ref = parseTypeFieldsInput([{ name: "owner", kind: "ref", ref_type: "person" }], ["person"]);
  assert.equal(ref.ok, true);
  const missing = parseTypeFieldsInput([{ name: "owner", kind: "ref", ref_type: "ghost" }], ["person"]);
  assert.equal(missing.ok, false);
});

test("compile: needed is not required; extra keys pass; wrong kind misses", () => {
  const parsed = parseTypeFieldsInput([{ name: "due", kind: "date", role: "date", needed: true }]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const schema = compileJsonSchemaFromFields(parsed.fields);
  assert.equal(schema?.additionalProperties, true);
  assert.equal(schema && "required" in schema ? schema.required : undefined, undefined);
  assert.equal(validateDataAgainstJsonSchema({}, schema, "task"), null);
  assert.equal(validateDataAgainstJsonSchema({ mood: "ok", due: "2026-08-27" }, schema, "task"), null);
  const miss = validateDataAgainstJsonSchema({ due: "tomorrow" }, schema, "task");
  assert.ok(miss);
  assert.match(miss.error, /does not match json_schema/);
});
