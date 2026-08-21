import assert from "node:assert/strict";
import { test } from "node:test";
import { dueTone, isUuid, parseSearchSnippet, relativeTime, truncate, compareOpenTasks, compareRecentRows, HOME_WIDGET_LIMIT } from "./format";

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

test("Home widget sort is due-urgency then recency, capped at 5", () => {
  assert.equal(HOME_WIDGET_LIMIT, 5);
  const tasks = [
    { title: "Undated" },
    { title: "Soon", due: "2026-08-28", due_tone: "future" as const },
    { title: "Overdue new", due: "2026-08-10", due_tone: "overdue" as const },
    { title: "Today", due: "2026-08-21", due_tone: "today" as const },
    { title: "Overdue old", due: "2026-08-01", due_tone: "overdue" as const },
  ];
  assert.deepEqual(
    [...tasks].sort(compareOpenTasks).map((task) => task.title),
    ["Overdue old", "Overdue new", "Today", "Soon", "Undated"],
  );
  const recents = [
    { title: "Older", updated_at: "2026-08-20T12:00:00.000Z" },
    { title: "B same time", updated_at: "2026-08-21T12:00:00.000Z" },
    { title: "A same time", updated_at: "2026-08-21T12:00:00.000Z" },
  ];
  assert.deepEqual(
    [...recents].sort(compareRecentRows).map((row) => row.title),
    ["A same time", "B same time", "Older"],
  );
});

test("parseSearchSnippet turns FTS <b> marks into emphasis parts", () => {
  assert.deepEqual(parseSearchSnippet("note about <b>fiancee</b> dinner"), [
    { text: "note about ", hit: false },
    { text: "fiancee", hit: true },
    { text: " dinner", hit: false },
  ]);
  assert.deepEqual(parseSearchSnippet("no marks here"), [{ text: "no marks here", hit: false }]);
  assert.deepEqual(parseSearchSnippet("see <b>one</b> and <b>two</b>"), [
    { text: "see ", hit: false },
    { text: "one", hit: true },
    { text: " and ", hit: false },
    { text: "two", hit: true },
  ]);
  assert.deepEqual(parseSearchSnippet("raw <b>open"), [{ text: "raw open", hit: false }]);
  assert.deepEqual(parseSearchSnippet("stray </b> close"), [{ text: "stray  close", hit: false }]);
});
