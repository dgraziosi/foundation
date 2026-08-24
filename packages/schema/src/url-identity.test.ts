import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import {
  URL_IDENTITY_SYSTEMS,
  applyUrlIdentityFromUpsert,
  urlIdentityConflictError,
  urlIdentityFromMetadata,
  urlIdentityFromValue,
} from "./url-identity.js";

test("urlIdentityFromValue ignores missing or empty url", () => {
  assert.equal(urlIdentityFromValue(undefined), undefined);
  assert.equal(urlIdentityFromValue(null), undefined);
  assert.equal(urlIdentityFromValue({}), undefined);
});

test("urlIdentityFromValue does not read leftover living, origin, or link bags", () => {
  assert.equal(urlIdentityFromMetadata({ living: { system: "drive", id: "file-fixture-1" } }), undefined);
  assert.equal(urlIdentityFromMetadata({ origin: { system: "drive", id: "file-fixture-1" } }), undefined);
  assert.equal(urlIdentityFromMetadata({ link: { system: "drive", id: "file-fixture-1" } }), undefined);
});

test("urlIdentityFromValue accepts gmail | calendar | drive and refuses github", () => {
  assert.deepEqual(URL_IDENTITY_SYSTEMS, ["gmail", "calendar", "drive"]);
  for (const system of URL_IDENTITY_SYSTEMS) {
    const parsed = urlIdentityFromValue({ system, id: "ext-1" });
    assert.equal(isToolError(parsed), false);
    assert.deepEqual(parsed, { system, id: "ext-1" });
  }
  const github = urlIdentityFromValue({ system: "github", id: "repo-fixture-1" });
  assert.equal(isToolError(github), true);
  if (isToolError(github)) {
    assert.match(github.error, /Unknown url.system "github"/);
    assert.match(github.suggestion ?? "", /data\.repo/i);
  }
});

test("urlIdentityFromValue trims id and refuses incomplete or unknown systems", () => {
  const trimmed = urlIdentityFromValue({ system: "gmail", id: "  msg-9  " });
  assert.deepEqual(trimmed, { system: "gmail", id: "msg-9" });

  const missingId = urlIdentityFromValue({ system: "gmail" });
  assert.equal(isToolError(missingId), true);
  if (isToolError(missingId)) {
    assert.match(missingId.error, /requires system and id/);
    assert.match(missingId.suggestion ?? "", /do not fetch or mirror/i);
  }

  const unknown = urlIdentityFromValue({ system: "slack", id: "x" });
  assert.equal(isToolError(unknown), true);
  if (isToolError(unknown)) {
    assert.match(unknown.error, /Unknown url.system "slack"/);
  }

  const notObject = urlIdentityFromValue("gmail:1");
  assert.equal(isToolError(notObject), true);
});

test("urlIdentityConflictError points at the live node", () => {
  const err = urlIdentityConflictError("11111111-1111-4111-8111-111111111111", {
    system: "drive",
    id: "file-fixture-1",
  });
  assert.match(err.error, /drive:file-fixture-1/);
  assert.match(err.error, /11111111-1111-4111-8111-111111111111/);
  assert.match(err.suggestion ?? "", /do not create a twin/i);
});

test("applyUrlIdentityFromUpsert persists trimmed system and id on metadata", () => {
  const next = applyUrlIdentityFromUpsert({}, undefined, {
    system: "gmail",
    id: "  msg-9  ",
    extra: true,
  });
  assert.equal(isToolError(next), false);
  if (!isToolError(next)) {
    assert.deepEqual(next.url, { system: "gmail", id: "msg-9" });
  }
});

test("applyUrlIdentityFromUpsert drops url: null and ignores client metadata.url", () => {
  const cleared = applyUrlIdentityFromUpsert(
    { url: { system: "gmail", id: "msg-9" }, keep: true },
    { url: { system: "drive", id: "file-fixture-1" }, keep: true },
    null,
  );
  assert.equal(isToolError(cleared), false);
  if (!isToolError(cleared)) {
    assert.deepEqual(cleared, { keep: true });
  }
});

test("url identity reads system and id only: no kind, no https", () => {
  const parsed = urlIdentityFromValue({
    system: "drive",
    id: "file-fixture-1",
    kind: "sheet",
    url: "https://example.test/drive/file-fixture-1",
  });
  assert.deepEqual(parsed, { system: "drive", id: "file-fixture-1" });
  assert.ok(parsed && !("kind" in parsed) && !("url" in parsed));
});
