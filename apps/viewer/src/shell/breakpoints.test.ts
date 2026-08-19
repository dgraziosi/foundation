import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectorSheetOpen, isWideLane, WIDE_MIN_PX } from "./breakpoints.js";

test("inspector sheet is medium and narrow only", () => {
  assert.equal(WIDE_MIN_PX, 1280);
  assert.equal(isWideLane(1279), false);
  assert.equal(isWideLane(1280), true);
  assert.equal(inspectorSheetOpen(true, true), false);
  assert.equal(inspectorSheetOpen(true, false), true);
  assert.equal(inspectorSheetOpen(false, false), false);
});
