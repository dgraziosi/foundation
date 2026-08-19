import assert from "node:assert/strict";
import { test } from "node:test";
import { isAgentPath, isViewPath } from "./security.js";

test("view paths stay on the view door; mcp and blobs are agent paths", () => {
  assert.equal(isViewPath("/view"), true);
  assert.equal(isViewPath("/view/api/session"), true);
  assert.equal(isViewPath("/view/blobs/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isViewPath("/mcp"), false);
  assert.equal(isViewPath("/blobs/11111111-1111-4111-8111-111111111111"), false);
  assert.equal(isAgentPath("/mcp"), true);
  assert.equal(isAgentPath("/blobs/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isAgentPath("/view/blobs/11111111-1111-4111-8111-111111111111"), false);
  assert.equal(isAgentPath("/view/api/graph"), false);
  assert.equal(isAgentPath("/health"), false);
});
