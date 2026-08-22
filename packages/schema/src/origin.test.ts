import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import { ORIGIN_SYSTEMS, canonicalizeOriginInData, originConflictError, originFromData } from "./origin.js";

test("originFromData ignores missing or empty origin", () => {
  assert.equal(originFromData({}), undefined);
  assert.equal(originFromData({ origin: null }), undefined);
  assert.equal(originFromData({ origin: {} }), undefined);
});

test("originFromData accepts gmail | calendar | drive | github", () => {
  for (const system of ORIGIN_SYSTEMS) {
    const parsed = originFromData({ origin: { system, id: "ext-1" } });
    assert.equal(isToolError(parsed), false);
    assert.deepEqual(parsed, { system, id: "ext-1" });
  }
});

test("originFromData trims id and rejects incomplete or unknown systems", () => {
  const trimmed = originFromData({ origin: { system: "gmail", id: "  msg-9  " } });
  assert.deepEqual(trimmed, { system: "gmail", id: "msg-9" });

  const missingId = originFromData({ origin: { system: "gmail" } });
  assert.equal(isToolError(missingId), true);
  if (isToolError(missingId)) {
    assert.match(missingId.error, /requires system and id/);
    assert.match(missingId.suggestion ?? "", /do not fetch or mirror/i);
  }

  const unknown = originFromData({ origin: { system: "slack", id: "x" } });
  assert.equal(isToolError(unknown), true);
  if (isToolError(unknown)) {
    assert.match(unknown.error, /Unknown origin.system "slack"/);
  }

  const notObject = originFromData({ origin: "gmail:1" });
  assert.equal(isToolError(notObject), true);
});

test("originConflictError points at the live node", () => {
  const err = originConflictError("11111111-1111-4111-8111-111111111111", {
    system: "github",
    id: "user:42",
  });
  assert.match(err.error, /github:user:42/);
  assert.match(err.error, /11111111-1111-4111-8111-111111111111/);
  assert.match(err.suggestion ?? "", /do not create a twin/i);
});

test("canonicalizeOriginInData persists trimmed system and id", () => {
  const canonical = canonicalizeOriginInData({
    origin: { system: "gmail", id: "  msg-9  ", extra: true },
  });
  assert.deepEqual(canonical.origin, { system: "gmail", id: "msg-9", extra: true });
});

test("origin identity ignores kind: parsed origin is system and id only", () => {
  const parsed = originFromData({
    origin: { system: "gmail", id: "msg-fixture-1", kind: "sent" },
  });
  assert.deepEqual(parsed, { system: "gmail", id: "msg-fixture-1" });
  assert.ok(parsed && !("kind" in parsed));
});

test("origin identity ignores url hung on the origin object", () => {
  const parsed = originFromData({
    origin: {
      system: "drive",
      id: "file-fixture-1",
      url: "https://example.test/drive/file-fixture-1",
    },
  });
  assert.deepEqual(parsed, { system: "drive", id: "file-fixture-1" });
  assert.ok(parsed && !("url" in parsed));
});
