import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import {
  LINK_SYSTEMS,
  canonicalizeLinkInData,
  linkConflictError,
  linkFromData,
} from "./link.js";

test("linkFromData ignores missing or empty link", () => {
  assert.equal(linkFromData({}), undefined);
  assert.equal(linkFromData({ link: null }), undefined);
  assert.equal(linkFromData({ link: {} }), undefined);
});

test("linkFromData does not read leftover living or origin keys", () => {
  assert.equal(
    linkFromData({ living: { system: "drive", id: "file-fixture-1" } }),
    undefined,
  );
  assert.equal(
    linkFromData({ origin: { system: "drive", id: "file-fixture-1" } }),
    undefined,
  );
});

test("linkFromData accepts gmail | calendar | drive and refuses github", () => {
  assert.deepEqual(LINK_SYSTEMS, ["gmail", "calendar", "drive"]);
  for (const system of LINK_SYSTEMS) {
    const parsed = linkFromData({ link: { system, id: "ext-1" } });
    assert.equal(isToolError(parsed), false);
    assert.deepEqual(parsed, { system, id: "ext-1" });
  }
  const github = linkFromData({ link: { system: "github", id: "repo-fixture-1" } });
  assert.equal(isToolError(github), true);
  if (isToolError(github)) {
    assert.match(github.error, /Unknown link.system "github"/);
    assert.match(github.suggestion ?? "", /data\.repo/i);
  }
});

test("linkFromData trims id and refuses incomplete or unknown systems", () => {
  const trimmed = linkFromData({ link: { system: "gmail", id: "  msg-9  " } });
  assert.deepEqual(trimmed, { system: "gmail", id: "msg-9" });

  const missingId = linkFromData({ link: { system: "gmail" } });
  assert.equal(isToolError(missingId), true);
  if (isToolError(missingId)) {
    assert.match(missingId.error, /requires system and id/);
    assert.match(missingId.suggestion ?? "", /do not fetch or mirror/i);
  }

  const unknown = linkFromData({ link: { system: "slack", id: "x" } });
  assert.equal(isToolError(unknown), true);
  if (isToolError(unknown)) {
    assert.match(unknown.error, /Unknown link.system "slack"/);
  }

  const notObject = linkFromData({ link: "gmail:1" });
  assert.equal(isToolError(notObject), true);
});

test("linkConflictError points at the live node", () => {
  const err = linkConflictError("11111111-1111-4111-8111-111111111111", {
    system: "drive",
    id: "file-fixture-1",
  });
  assert.match(err.error, /drive:file-fixture-1/);
  assert.match(err.error, /11111111-1111-4111-8111-111111111111/);
  assert.match(err.suggestion ?? "", /do not create a twin/i);
});

test("canonicalizeLinkInData persists trimmed system and id", () => {
  const canonical = canonicalizeLinkInData({
    link: { system: "gmail", id: "  msg-9  ", extra: true },
  });
  assert.deepEqual(canonical.link, { system: "gmail", id: "msg-9", extra: true });
});

test("canonicalizeLinkInData drops link: null", () => {
  const cleared = canonicalizeLinkInData({ due: "2026-08-21", link: null });
  assert.deepEqual(cleared, { due: "2026-08-21" });
});

test("link reads system and id only: no kind, no url", () => {
  const parsed = linkFromData({
    link: {
      system: "drive",
      id: "file-fixture-1",
      kind: "sheet",
      url: "https://example.test/drive/file-fixture-1",
    },
  });
  assert.deepEqual(parsed, { system: "drive", id: "file-fixture-1" });
  assert.ok(parsed && !("kind" in parsed) && !("url" in parsed));
});
