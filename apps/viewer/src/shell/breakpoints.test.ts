import assert from "node:assert/strict";
import { test } from "node:test";
import { isWideLane, WIDE_MIN_PX } from "./breakpoints.js";

test("wide lane is 1280px", () => {
  assert.equal(WIDE_MIN_PX, 1280);
  assert.equal(isWideLane(1279), false);
  assert.equal(isWideLane(1280), true);
});
