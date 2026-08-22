import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import { CODE_SYSTEMS, canonicalizeCodeInData, codeConflictError, codeFromData } from "./code.js";

test("codeFromData ignores missing or empty code", () => {
  assert.equal(codeFromData({}), undefined);
  assert.equal(codeFromData({ code: null }), undefined);
  assert.equal(codeFromData({ code: {} }), undefined);
});

test("codeFromData does not read a leftover origin key", () => {
  assert.equal(
    codeFromData({ origin: { system: "github", id: "repo-fixture-1" } }),
    undefined,
  );
});

test("codeFromData accepts github and refuses living systems", () => {
  assert.deepEqual(CODE_SYSTEMS, ["github"]);
  const parsed = codeFromData({ code: { system: "github", id: "repo-fixture-1" } });
  assert.deepEqual(parsed, { system: "github", id: "repo-fixture-1" });

  for (const system of ["gmail", "calendar", "drive"] as const) {
    const refused = codeFromData({ code: { system, id: "ext-1" } });
    assert.equal(isToolError(refused), true, `expected refuse for ${system}`);
    if (isToolError(refused)) {
      assert.match(refused.suggestion ?? "", /data\.living/i);
    }
  }
});

test("codeFromData trims id and refuses incomplete values", () => {
  const trimmed = codeFromData({ code: { system: "github", id: "  repo-fixture-1  " } });
  assert.deepEqual(trimmed, { system: "github", id: "repo-fixture-1" });

  const missingId = codeFromData({ code: { system: "github" } });
  assert.equal(isToolError(missingId), true);

  const notObject = codeFromData({ code: "github:1" });
  assert.equal(isToolError(notObject), true);
});

test("codeConflictError points at the live node", () => {
  const err = codeConflictError("11111111-1111-4111-8111-111111111111", {
    system: "github",
    id: "repo-fixture-1",
  });
  assert.match(err.error, /github:repo-fixture-1/);
  assert.match(err.suggestion ?? "", /do not create a twin/i);
});

test("canonicalizeCodeInData persists trimmed system and id", () => {
  const canonical = canonicalizeCodeInData({
    code: { system: "github", id: "  repo-fixture-1  ", extra: true },
  });
  assert.deepEqual(canonical.code, { system: "github", id: "repo-fixture-1", extra: true });
});

test("canonicalizeCodeInData drops code: null", () => {
  const cleared = canonicalizeCodeInData({ url: "https://example.test/github/repo-fixture-1", code: null });
  assert.deepEqual(cleared, { url: "https://example.test/github/repo-fixture-1" });
});

test("code reads system and id only: no kind, no url", () => {
  const parsed = codeFromData({
    code: {
      system: "github",
      id: "repo-fixture-1",
      kind: "repo",
      url: "https://example.test/github/repo-fixture-1",
    },
  });
  assert.deepEqual(parsed, { system: "github", id: "repo-fixture-1" });
  assert.ok(parsed && !("kind" in parsed) && !("url" in parsed));
});
