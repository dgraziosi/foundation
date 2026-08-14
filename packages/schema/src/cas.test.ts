import assert from "node:assert/strict";
import { test } from "node:test";
import { assertIfMatch, timestampsEqual } from "./cas.js";

test("timestampsEqual compares ISO instants at millisecond precision", () => {
  assert.equal(timestampsEqual("2026-08-13T12:00:00.123Z", "2026-08-13T12:00:00.123Z"), true);
  assert.equal(timestampsEqual("2026-08-13T12:00:00.123Z", "2026-08-13T12:00:00.123000Z"), true);
  assert.equal(timestampsEqual("2026-08-13T04:04:36.861Z", "2026-08-13T04:04:36.861528Z"), true);
  assert.equal(timestampsEqual("2026-08-13T12:00:00.123Z", "2026-08-13T12:00:00.124Z"), false);
  assert.equal(timestampsEqual("not-a-date", "2026-08-13T12:00:00.123Z"), false);
  assert.equal(timestampsEqual("August 13, 2026", "2026-08-13T12:00:00.123Z"), false);
});

test("assertIfMatch refuses missing, invalid, and stale timestamps", () => {
  const current = "2026-08-13T12:00:00.123Z";
  const missing = assertIfMatch("base_updated_at", undefined, current);
  assert.equal(missing?.error.includes("Missing"), true);
  assert.match(missing?.suggestion ?? "", /if-match/);

  const invalid = assertIfMatch("base_updated_at", "yesterday", current);
  assert.equal(invalid?.error.includes("Invalid"), true);

  const stale = assertIfMatch("base_updated_at", "2026-08-13T11:00:00.000Z", current);
  assert.equal(stale?.error.includes("does not match"), true);
  assert.match(stale?.suggestion ?? "", /get and retry/);

  assert.equal(assertIfMatch("base_updated_at", current, current), null);
});
