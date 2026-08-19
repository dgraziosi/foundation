import assert from "node:assert/strict";
import { test } from "node:test";
import { dueTone, isUuid, relativeTime, truncate } from "./format";

test("dueTone: overdue, today, future", () => {
  assert.equal(dueTone("2026-08-01", "2026-08-19"), "overdue");
  assert.equal(dueTone("2026-08-19", "2026-08-19"), "today");
  assert.equal(dueTone("2026-08-20", "2026-08-19"), "future");
});

test("relativeTime uses compact units", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  assert.equal(relativeTime("2026-08-19T11:59:30Z", now), "just now");
  assert.equal(relativeTime("2026-08-19T11:10:00Z", now), "50m");
  assert.equal(relativeTime("2026-08-19T09:00:00Z", now), "3h");
  assert.equal(relativeTime("2026-08-17T12:00:00Z", now), "2d");
});

test("truncate and uuid helpers", () => {
  assert.equal(truncate("short"), "short");
  assert.equal(truncate("abcdefghijklmnopqrstuvwxyz", 8), "abcdefg…");
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});
