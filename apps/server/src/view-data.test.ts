import assert from "node:assert/strict";
import { test } from "node:test";
import { applyViewQuery, SEED_TYPE_VIEWS } from "@foundation/schema";
import { compareOpenTasks, dueTone, recencyGroup, rootToParent, taskDueGroup } from "./view-data.js";

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

test("seed task filter then cap 5 drops a completed overdue that would sort first", () => {
  const board = SEED_TYPE_VIEWS.task.views.find((view) => view.id === "board");
  assert.ok(board);
  assert.deepEqual(board.filter, { clauses: [{ bind: "status", op: "eq", value: "active" }] });
  const dueField = { name: "due", display: "Due", kind: "date" as const, needed: false, role: "date" as const };
  const rows = [
    { id: "c", title: "Widget completed overdue", status: "completed", data: { due: "2019-01-01" } },
    { id: "z", title: "Widget archived overdue", status: "archived", data: { due: "2019-06-01" } },
    { id: "1", title: "Widget overdue old", status: "active", data: { due: "2020-01-01" } },
    { id: "2", title: "Widget overdue new", status: "active", data: { due: "2020-06-01" } },
    { id: "3", title: "Fixture due task", status: "active", data: { due: "2026-08-20" } },
    { id: "4", title: "Widget upcoming far", status: "active", data: { due: "2099-01-01" } },
    { id: "5", title: "Widget undated a", status: "active", data: {} },
    { id: "6", title: "Widget undated b", status: "active", data: {} },
  ];
  const queried = applyViewQuery(rows, board, [dueField]);
  const today = "2026-08-21";
  const asDue = (row: { title: string; data: Record<string, unknown> }) => ({
    title: row.title,
    due: typeof row.data.due === "string" ? row.data.due : undefined,
  });
  const limited = [...queried]
    .sort((left, right) => compareOpenTasks(asDue(left), asDue(right), today))
    .slice(0, 5);
  assert.equal(limited.length, 5);
  assert.ok(limited.every((row) => row.status === "active"));
  assert.ok(!limited.some((row) => row.title === "Widget completed overdue"));
  assert.ok(!limited.some((row) => row.title === "Widget archived overdue"));
  assert.deepEqual(
    limited.map((row) => row.title),
    [
      "Widget overdue old",
      "Widget overdue new",
      "Fixture due task",
      "Widget upcoming far",
      "Widget undated a",
    ],
  );
});

test("compareOpenTasks is overdue, today, upcoming, then undated", () => {
  const today = "2026-08-21";
  const tasks = [
    { title: "Undated" },
    { title: "Soon", due: "2026-08-28" },
    { title: "Overdue new", due: "2026-08-10" },
    { title: "Today", due: today },
    { title: "Overdue old", due: "2026-08-01" },
    { title: "Later", due: "2026-09-01" },
  ];
  assert.deepEqual(
    [...tasks].sort((a, b) => compareOpenTasks(a, b, today)).map((task) => task.title),
    ["Overdue old", "Overdue new", "Today", "Soon", "Later", "Undated"],
  );
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
