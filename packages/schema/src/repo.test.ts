import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import { REPO_SYSTEMS, canonicalizeRepoInData, repoConflictError, repoFromData } from "./repo.js";

test("repoFromData ignores missing or empty repo", () => {
  assert.equal(repoFromData({}), undefined);
  assert.equal(repoFromData({ repo: null }), undefined);
  assert.equal(repoFromData({ repo: {} }), undefined);
});

test("repoFromData does not read leftover code or origin keys", () => {
  assert.equal(
    repoFromData({ code: { system: "github", id: "repo-fixture-1" } }),
    undefined,
  );
  assert.equal(
    repoFromData({ origin: { system: "github", id: "repo-fixture-1" } }),
    undefined,
  );
});

test("repoFromData accepts github and refuses gmail / calendar / drive", () => {
  assert.deepEqual(REPO_SYSTEMS, ["github"]);
  const parsed = repoFromData({ repo: { system: "github", id: "repo-fixture-1" } });
  assert.deepEqual(parsed, { system: "github", id: "repo-fixture-1" });

  for (const system of ["gmail", "calendar", "drive"] as const) {
    const refused = repoFromData({ repo: { system, id: "ext-1" } });
    assert.equal(isToolError(refused), true, `expected refuse for ${system}`);
    if (isToolError(refused)) {
      assert.match(refused.suggestion ?? "", /search \{ url \}/i);
    }
  }
});

test("repoFromData trims id and refuses incomplete values", () => {
  const trimmed = repoFromData({ repo: { system: "github", id: "  repo-fixture-1  " } });
  assert.deepEqual(trimmed, { system: "github", id: "repo-fixture-1" });

  const missingId = repoFromData({ repo: { system: "github" } });
  assert.equal(isToolError(missingId), true);

  const notObject = repoFromData({ repo: "github:1" });
  assert.equal(isToolError(notObject), true);
});

test("repoConflictError points at the live node", () => {
  const err = repoConflictError("11111111-1111-4111-8111-111111111111", {
    system: "github",
    id: "repo-fixture-1",
  });
  assert.match(err.error, /github:repo-fixture-1/);
  assert.match(err.suggestion ?? "", /do not create a twin/i);
});

test("canonicalizeRepoInData persists trimmed system and id", () => {
  const canonical = canonicalizeRepoInData({
    repo: { system: "github", id: "  repo-fixture-1  ", extra: true },
  });
  assert.deepEqual(canonical.repo, { system: "github", id: "repo-fixture-1", extra: true });
});

test("canonicalizeRepoInData drops repo: null", () => {
  const cleared = canonicalizeRepoInData({ due: "2026-08-21", repo: null });
  assert.deepEqual(cleared, { due: "2026-08-21" });
});

test("repo reads system and id only: no kind, no url", () => {
  const parsed = repoFromData({
    repo: {
      system: "github",
      id: "repo-fixture-1",
      kind: "repo",
      url: "https://example.test/github/repo-fixture-1",
    },
  });
  assert.deepEqual(parsed, { system: "github", id: "repo-fixture-1" });
  assert.ok(parsed && !("kind" in parsed) && !("url" in parsed));
});
