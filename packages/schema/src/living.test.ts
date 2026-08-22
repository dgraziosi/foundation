import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import {
  LIVING_SYSTEMS,
  canonicalizeLivingInData,
  livingConflictError,
  livingFromData,
} from "./living.js";

test("livingFromData ignores missing or empty living", () => {
  assert.equal(livingFromData({}), undefined);
  assert.equal(livingFromData({ living: null }), undefined);
  assert.equal(livingFromData({ living: {} }), undefined);
});

test("livingFromData does not read a leftover origin key", () => {
  assert.equal(
    livingFromData({ origin: { system: "drive", id: "file-fixture-1" } }),
    undefined,
  );
});

test("livingFromData accepts gmail | calendar | drive and refuses github", () => {
  assert.deepEqual(LIVING_SYSTEMS, ["gmail", "calendar", "drive"]);
  for (const system of LIVING_SYSTEMS) {
    const parsed = livingFromData({ living: { system, id: "ext-1" } });
    assert.equal(isToolError(parsed), false);
    assert.deepEqual(parsed, { system, id: "ext-1" });
  }
  const github = livingFromData({ living: { system: "github", id: "repo-fixture-1" } });
  assert.equal(isToolError(github), true);
  if (isToolError(github)) {
    assert.match(github.error, /Unknown living.system "github"/);
    assert.match(github.suggestion ?? "", /data\.code/i);
  }
});

test("livingFromData trims id and refuses incomplete or unknown systems", () => {
  const trimmed = livingFromData({ living: { system: "gmail", id: "  msg-9  " } });
  assert.deepEqual(trimmed, { system: "gmail", id: "msg-9" });

  const missingId = livingFromData({ living: { system: "gmail" } });
  assert.equal(isToolError(missingId), true);
  if (isToolError(missingId)) {
    assert.match(missingId.error, /requires system and id/);
    assert.match(missingId.suggestion ?? "", /do not fetch or mirror/i);
  }

  const unknown = livingFromData({ living: { system: "slack", id: "x" } });
  assert.equal(isToolError(unknown), true);
  if (isToolError(unknown)) {
    assert.match(unknown.error, /Unknown living.system "slack"/);
  }

  const notObject = livingFromData({ living: "gmail:1" });
  assert.equal(isToolError(notObject), true);
});

test("livingConflictError points at the live node", () => {
  const err = livingConflictError("11111111-1111-4111-8111-111111111111", {
    system: "drive",
    id: "file-fixture-1",
  });
  assert.match(err.error, /drive:file-fixture-1/);
  assert.match(err.error, /11111111-1111-4111-8111-111111111111/);
  assert.match(err.suggestion ?? "", /do not create a twin/i);
});

test("canonicalizeLivingInData persists trimmed system and id", () => {
  const canonical = canonicalizeLivingInData({
    living: { system: "gmail", id: "  msg-9  ", extra: true },
  });
  assert.deepEqual(canonical.living, { system: "gmail", id: "msg-9", extra: true });
});

test("living reads system and id only: no kind, no url", () => {
  const parsed = livingFromData({
    living: {
      system: "drive",
      id: "file-fixture-1",
      kind: "sheet",
      url: "https://example.test/drive/file-fixture-1",
    },
  });
  assert.deepEqual(parsed, { system: "drive", id: "file-fixture-1" });
  assert.ok(parsed && !("kind" in parsed) && !("url" in parsed));
});
