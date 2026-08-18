import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import {
  applyAliasesFromPatch,
  canonicalizeAliasesPatch,
  patchHasAliases,
  wellFormedAliasStrings,
} from "./aliases.js";
import { nameCompact, nameNorm } from "./name-norm.js";

test("nameNorm folds case, accents, punctuation, and whitespace", () => {
  assert.equal(nameNorm("Café Luna"), "cafe luna");
  assert.equal(nameNorm("priya  shah"), "priya shah");
  assert.equal(nameNorm("O'Brien"), "o brien");
  assert.equal(nameNorm("Pree-uh"), "pree uh");
  assert.equal(nameCompact("O Brien"), "obrien");
  assert.equal(nameCompact("Obrien"), "obrien");
  assert.notEqual(nameNorm("O Brien"), nameNorm("Obrien"));
});

test("nameNorm matches SQL unaccent folds that [a-z0-9] used to drop", () => {
  assert.equal(nameNorm("ßtrasse"), "sstrasse");
  assert.equal(nameNorm("Straße"), "strasse");
  assert.equal(nameNorm("øl"), "ol");
  assert.equal(nameNorm("Łódź"), "lodz");
  assert.equal(nameNorm("þing"), "thing");
  assert.equal(nameNorm("Æsir"), "aesir");
  assert.equal(nameNorm("中"), "中");
  assert.equal(nameNorm("я"), "я");
  assert.equal(nameNorm("---"), "");
  assert.equal(nameNorm("…"), "");
});

test("canonicalizeAliasesPatch accepts [] and dedups by name_norm", () => {
  assert.deepEqual(canonicalizeAliasesPatch([]), []);
  const kept = canonicalizeAliasesPatch(["Pri", "pri", "  Pree-uh  "]);
  assert.deepEqual(kept, ["Pri", "Pree-uh"]);
});

test("canonicalizeAliasesPatch refuses malformed values", () => {
  for (const bad of ["Pri", [""], [1], [null], { 0: "x" }, ["---"], ["…"], ["***"], ["  ---  "]]) {
    const result = canonicalizeAliasesPatch(bad);
    assert.equal(isToolError(result), true);
  }
});

test("canonicalizeAliasesPatch refuses empty-fold values and only [] clears", () => {
  const punct = canonicalizeAliasesPatch(["Pri", "---"]);
  assert.equal(isToolError(punct), true);
  const onlyPunct = canonicalizeAliasesPatch(["---"]);
  assert.equal(isToolError(onlyPunct), true);
  assert.deepEqual(canonicalizeAliasesPatch([]), []);
  const kept = canonicalizeAliasesPatch(["Straße", "strasse"]);
  assert.deepEqual(kept, ["Straße"]);
  const applied = applyAliasesFromPatch({ aliases: ["Pri"] }, { aliases: ["---"] });
  assert.equal(isToolError(applied), true);
  const cleared = applyAliasesFromPatch({ aliases: ["Pri"] }, { aliases: [] });
  assert.deepEqual(cleared, { aliases: [] });
});

test("applyAliasesFromPatch is patch-gated", () => {
  const merged = { note: "keep", aliases: "legacy-bad" };
  assert.equal(patchHasAliases({ note: "x" }), false);
  const unrelated = applyAliasesFromPatch(merged, { note: "x" });
  assert.deepEqual(unrelated, merged);
  const omitted = applyAliasesFromPatch(merged, undefined);
  assert.deepEqual(omitted, merged);
  const cleared = applyAliasesFromPatch(merged, { aliases: [] });
  assert.deepEqual(cleared, { note: "keep", aliases: [] });
});

test("wellFormedAliasStrings ignores malformed legacy values", () => {
  assert.deepEqual(wellFormedAliasStrings({ aliases: "Pri" }), []);
  assert.deepEqual(wellFormedAliasStrings({ aliases: { 0: "x" } }), []);
  assert.deepEqual(wellFormedAliasStrings({ aliases: ["Pri", 1, "  "] }), ["Pri"]);
  assert.deepEqual(wellFormedAliasStrings({}), []);
});
