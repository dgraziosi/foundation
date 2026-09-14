import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideIdentityBag,
  missingMergeConfirm,
  planIdentityMoves,
  unionAliasesForMerge,
} from "./merge.js";

test("missingMergeConfirm refuses omit and false", () => {
  const omitted = missingMergeConfirm(undefined);
  assert.equal(omitted?.error, "merge needs confirm: true");
  assert.match(omitted?.suggestion ?? "", /confirm: true/);
  const refused = missingMergeConfirm(false);
  assert.equal(refused?.error, "merge needs confirm: true");
  assert.equal(missingMergeConfirm(true), null);
});

test("unionAliasesForMerge dedupes by name_norm and ignores malformed legacy", () => {
  const unioned = unionAliasesForMerge(
    { aliases: ["Keep Name", "---", 12] as unknown as string[] },
    { aliases: ["keep name", "Drop Alias", "not-folded   "] },
  );
  assert.deepEqual(unioned, ["Keep Name", "Drop Alias", "not-folded"]);
});

test("unionAliasesForMerge ignores a non-array keep bag the way lookup does", () => {
  const unioned = unionAliasesForMerge({ aliases: "not-an-array" } as Record<string, unknown>, {
    aliases: ["Only Drop"],
  });
  assert.deepEqual(unioned, ["Only Drop"]);
});

test("decideIdentityBag moves drop-only values and refuses conflicts", () => {
  assert.deepEqual(decideIdentityBag("url", undefined, { system: "gmail", id: "m1" }), {
    bag: "url",
    action: "move",
    value: { system: "gmail", id: "m1" },
  });
  assert.deepEqual(
    decideIdentityBag("repo", { system: "github", id: "a" }, { system: "github", id: "a" }),
    { bag: "repo", action: "keep" },
  );
  assert.deepEqual(
    decideIdentityBag("receipt", { system: "gmail", id: "a" }, { system: "gmail", id: "b" }),
    { bag: "receipt", action: "conflict" },
  );
});

test("planIdentityMoves collects drop-only bags and refuses a conflict", () => {
  const planned = planIdentityMoves(
    { data: {}, metadata: {} },
    {
      data: { repo: { system: "github", id: "repo-1" } },
      metadata: { url: { system: "drive", id: "file-1" } },
    },
  );
  assert.deepEqual(planned, { moves: ["url", "repo"] });
  const conflict = planIdentityMoves(
    { metadata: { url: { system: "gmail", id: "a" } } },
    { metadata: { url: { system: "gmail", id: "b" } } },
  );
  assert.equal(
    "error" in conflict && conflict.error,
    "Cannot merge: keep and drop hold conflicting url identity",
  );
});
