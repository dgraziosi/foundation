import assert from "node:assert/strict";
import { test } from "node:test";
import { dueTone, recencyGroup, rootToParent, taskDueGroup } from "./view-data.js";

test("dueTone marks overdue, today, and future", () => {
  assert.equal(dueTone("2026-08-01", "2026-08-19"), "overdue");
  assert.equal(dueTone("2026-08-19", "2026-08-19"), "today");
  assert.equal(dueTone("2026-08-20", "2026-08-19"), "future");
});

test("taskDueGroup is Overdue / Today / Upcoming / No date", () => {
  assert.equal(taskDueGroup(undefined, "2026-08-19"), "No date");
  assert.equal(taskDueGroup("2026-08-01", "2026-08-19"), "Overdue");
  assert.equal(taskDueGroup("2026-08-19", "2026-08-19"), "Today");
  assert.equal(taskDueGroup("2026-08-20", "2026-08-19"), "Upcoming");
});

test("recencyGroup is Today / Yesterday / Earlier this week / Earlier", () => {
  const now = new Date("2026-08-19T16:00:00Z");
  assert.equal(recencyGroup("2026-08-19T12:00:00Z", now), "Today");
  assert.equal(recencyGroup("2026-08-18T12:00:00Z", now), "Yesterday");
  assert.equal(recencyGroup("2026-08-17T12:00:00Z", now), "Earlier this week");
  assert.equal(recencyGroup("2026-08-01T12:00:00Z", now), "Earlier");
});

test("ancestors are root → parent", () => {
  assert.deepEqual(
    rootToParent([{ title: "Project" }, { title: "Area" }]).map((item) => item.title),
    ["Area", "Project"],
  );
});
