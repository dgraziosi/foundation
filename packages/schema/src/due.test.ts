import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDataAgainstJsonSchema } from "./json-schema.js";
import {
  DUE_DATA_JSON_SCHEMA,
  DUE_TIMEZONE,
  canonicalizeDueInData,
  dueFromData,
  dueKeyIsInvalid,
  isIsoDate,
  matchesDueFilters,
  todayInNewYork,
  todayInTimeZone,
} from "./due.js";

test("isIsoDate accepts calendar YYYY-MM-DD only", () => {
  assert.equal(isIsoDate("2026-08-27"), true);
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2026-08-27T00:00:00Z"), false);
  assert.equal(isIsoDate("August 27"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("26-08-27"), false);
});

test("todayInNewYork is YYYY-MM-DD in America/New_York", () => {
  assert.equal(DUE_TIMEZONE, "America/New_York");
  const today = todayInNewYork();
  assert.equal(isIsoDate(today), true);
  const winter = todayInTimeZone(DUE_TIMEZONE, new Date("2026-01-15T05:00:00Z"));
  assert.equal(winter, "2026-01-15");
  const beforeMidnightEt = todayInTimeZone(DUE_TIMEZONE, new Date("2026-08-14T03:30:00Z"));
  assert.equal(beforeMidnightEt, "2026-08-13");
  const afterMidnightEt = todayInTimeZone(DUE_TIMEZONE, new Date("2026-08-14T04:30:00Z"));
  assert.equal(afterMidnightEt, "2026-08-14");
});

test("dueFromData reads a valid data.due and ignores junk", () => {
  assert.equal(dueFromData({ due: "2026-08-27" }), "2026-08-27");
  assert.equal(dueFromData({}), undefined);
  assert.equal(dueFromData({ due: "August 27" }), undefined);
});

test("matchesDueFilters: missing due never matches a due filter", () => {
  assert.equal(matchesDueFilters(undefined, { due: "overdue" }, "2026-08-14"), false);
  assert.equal(matchesDueFilters(undefined, { due: "today" }, "2026-08-14"), false);
  assert.equal(matchesDueFilters(undefined, { due_on_or_before: "2026-08-27" }, "2026-08-14"), false);
  assert.equal(matchesDueFilters(undefined, {}, "2026-08-14"), true);
});

test("matchesDueFilters: overdue, today, and inclusive window", () => {
  assert.equal(matchesDueFilters("2026-08-13", { due: "overdue" }, "2026-08-14"), true);
  assert.equal(matchesDueFilters("2026-08-14", { due: "overdue" }, "2026-08-14"), false);
  assert.equal(matchesDueFilters("2026-08-14", { due: "today" }, "2026-08-14"), true);
  assert.equal(matchesDueFilters("2026-08-13", { due: "today" }, "2026-08-14"), false);
  assert.equal(matchesDueFilters("2026-08-27", { due_on_or_before: "2026-08-27" }, "2026-08-14"), true);
  assert.equal(matchesDueFilters("2026-08-28", { due_on_or_before: "2026-08-27" }, "2026-08-14"), false);
  assert.equal(matchesDueFilters("2026-08-27", { due_on_or_after: "2026-08-27" }, "2026-08-14"), true);
  assert.equal(
    matchesDueFilters(
      "2026-08-20",
      { due_on_or_after: "2026-08-01", due_on_or_before: "2026-08-27" },
      "2026-08-14",
    ),
    true,
  );
});

test("json_schema: due is optional; null clears; invalid due misses", () => {
  assert.equal(validateDataAgainstJsonSchema({}, DUE_DATA_JSON_SCHEMA, "task"), null);
  assert.equal(
    validateDataAgainstJsonSchema({ title_note: "undated" }, DUE_DATA_JSON_SCHEMA, "task"),
    null,
  );
  assert.equal(
    validateDataAgainstJsonSchema({ due: "2026-08-27" }, DUE_DATA_JSON_SCHEMA, "goal"),
    null,
  );
  assert.equal(validateDataAgainstJsonSchema({ due: null }, DUE_DATA_JSON_SCHEMA, "task"), null);
  const miss = validateDataAgainstJsonSchema(
    { due: "2026-08-27T00:00:00Z" },
    DUE_DATA_JSON_SCHEMA,
    "task",
  );
  assert.ok(miss);
  assert.match(miss.error, /does not match json_schema for type "task"/);
});

test("canonicalizeDueInData drops null due; dueKeyIsInvalid catches Feb 31", () => {
  assert.deepEqual(canonicalizeDueInData({ due: null, other: 1 }), { other: 1 });
  assert.deepEqual(canonicalizeDueInData({ due: "2026-08-27" }), { due: "2026-08-27" });
  assert.equal(dueKeyIsInvalid({ due: "2026-02-31" }), true);
  assert.equal(dueKeyIsInvalid({ due: "2026-08-27" }), false);
  assert.equal(dueKeyIsInvalid({}), false);
});
