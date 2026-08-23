import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import { urlIdentityFromValue } from "./url-identity.js";
import {
  URL_FIXTURE,
  URL_MAX_LEN,
  applyUrlFromPatch,
  canonicalizeUrlInData,
  openableUrlFromData,
  patchHasUrl,
  urlFromData,
} from "./url.js";

test("urlFromData ignores missing or null url", () => {
  assert.equal(urlFromData({}), undefined);
  assert.equal(urlFromData({ url: null }), undefined);
});

test("urlFromData accepts a trimmed https fixture href", () => {
  const parsed = urlFromData({ url: `  ${URL_FIXTURE}  ` });
  assert.equal(isToolError(parsed), false);
  assert.equal(parsed, URL_FIXTURE);
});

test("urlFromData accepts later-shape https fixtures without live ids", () => {
  for (const href of [
    "https://example.test/spreadsheets/file-fixture-1",
    "https://example.test/mail/msg-fixture-1",
    "https://example.test/calendar/evt-fixture-1",
  ]) {
    assert.equal(urlFromData({ url: href }), href);
  }
});

test("urlFromData refuses empty, non-https, credentials, and non-strings", () => {
  for (const bad of [
    "",
    "   ",
    "http://example.test/drive/file-fixture-1",
    "javascript:alert(1)",
    "data:text/plain,fixture",
    "file:///tmp/fixture",
    "ftp://example.test/file-fixture-1",
    "https://user:pass@example.test/drive/file-fixture-1",
    "https://",
    "/drive/file-fixture-1",
    "example.test/drive/file-fixture-1",
    "https://example.test/drive/file fixture-1",
    1,
    { href: URL_FIXTURE },
    [URL_FIXTURE],
  ]) {
    const result = urlFromData({ url: bad });
    assert.equal(isToolError(result), true, `expected refuse for ${JSON.stringify(bad)}`);
  }
});

test("urlFromData refuses an overlong href", () => {
  const tooLong = `https://example.test/${"a".repeat(URL_MAX_LEN)}`;
  const result = urlFromData({ url: tooLong });
  assert.equal(isToolError(result), true);
});

test("canonicalizeUrlInData trims and drops url: null", () => {
  assert.deepEqual(canonicalizeUrlInData({ url: `  ${URL_FIXTURE}  ` }), { url: URL_FIXTURE });
  assert.deepEqual(canonicalizeUrlInData({ url: null, keep: true }), { keep: true });
});

test("applyUrlFromPatch is patch-gated and null clears", () => {
  const merged = { note: "keep", url: "legacy-bad" };
  assert.equal(patchHasUrl({ note: "x" }), false);
  const unrelated = applyUrlFromPatch(merged, { note: "x" });
  assert.deepEqual(unrelated, merged);
  const omitted = applyUrlFromPatch(merged, undefined);
  assert.deepEqual(omitted, merged);
  const written = applyUrlFromPatch(merged, { url: `  ${URL_FIXTURE}  ` });
  assert.deepEqual(written, { note: "keep", url: URL_FIXTURE });
  const cleared = applyUrlFromPatch({ note: "keep", url: URL_FIXTURE }, { url: null });
  assert.deepEqual(cleared, { note: "keep" });
  const refused = applyUrlFromPatch(merged, { url: "javascript:alert(1)" });
  assert.equal(isToolError(refused), true);
});

test("openableUrlFromData is Viewer Open: well-formed https only", () => {
  assert.equal(openableUrlFromData({ url: URL_FIXTURE }), URL_FIXTURE);
  assert.equal(openableUrlFromData({ url: "javascript:alert(1)" }), undefined);
  assert.equal(openableUrlFromData({ url: "legacy-bad" }), undefined);
  assert.equal(openableUrlFromData({}), undefined);
  assert.equal(openableUrlFromData(undefined), undefined);
});

test("data.url https is not the Drive / Gmail / Calendar url", () => {
  const data = {
    url: URL_FIXTURE,
  };
  assert.equal(urlFromData(data), URL_FIXTURE);
  const identity = urlIdentityFromValue({
    system: "drive",
    id: "file-fixture-1",
    url: URL_FIXTURE,
  });
  assert.deepEqual(identity, { system: "drive", id: "file-fixture-1" });
  assert.ok(identity && !("url" in identity) && !("kind" in identity));
  const objectUrl = urlFromData({ url: { system: "drive", id: "file-fixture-1" } });
  assert.equal(typeof objectUrl, "object");
});

test("url is not a second identity: schema does not unique it", () => {
  const left = urlFromData({ url: URL_FIXTURE });
  const right = urlFromData({ url: URL_FIXTURE });
  assert.equal(left, right);
  assert.equal(urlFromData({ url: "https://example.test/drive/file-fixture-2" }), "https://example.test/drive/file-fixture-2");
});
