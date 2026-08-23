import assert from "node:assert/strict";
import { test } from "node:test";
import { openableUrl } from "./url.js";

test("openableUrl is Viewer Open: well-formed https only", () => {
  assert.equal(openableUrl({ url: "https://example.test/drive/file-fixture-1" }), "https://example.test/drive/file-fixture-1");
  assert.equal(openableUrl({ url: "  https://example.test/drive/file-fixture-1  " }), "https://example.test/drive/file-fixture-1");
  assert.equal(openableUrl({ url: "javascript:alert(1)" }), undefined);
  assert.equal(openableUrl({ url: "http://example.test/drive/file-fixture-1" }), undefined);
  assert.equal(openableUrl({ url: "https://user:pass@example.test/drive/file-fixture-1" }), undefined);
  assert.equal(openableUrl({ url: "legacy-bad" }), undefined);
  assert.equal(openableUrl({}), undefined);
  assert.equal(openableUrl(undefined), undefined);
});
