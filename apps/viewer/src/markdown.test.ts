import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdownForTests } from "./markdown.js";
import { recencyGroup, taskDueGroup } from "./format.js";

test("markdown paints headings, lists, quotes, code, callouts, and dividers", () => {
  const blocks = parseMarkdownForTests(`# Title

A paragraph.

- one
- two

> quoted

\`\`\`
code
\`\`\`

> [!WARNING]
> beware

---
`);
  const kinds = blocks.map((block) => block.kind);
  assert.ok(kinds.includes("heading"));
  assert.ok(kinds.includes("list"));
  assert.ok(kinds.includes("quote"));
  assert.ok(kinds.includes("code"));
  assert.ok(kinds.includes("callout"));
  assert.ok(kinds.includes("divider"));
  const callout = blocks.find((block) => block.kind === "callout");
  assert.equal(callout && callout.kind === "callout" ? callout.tone : "", "warning");
});

test("recency groups Today / Yesterday / Earlier this week / Earlier", () => {
  const now = new Date("2026-08-19T16:00:00Z");
  assert.equal(recencyGroup("2026-08-19T12:00:00Z", now), "Today");
  assert.equal(recencyGroup("2026-08-18T12:00:00Z", now), "Yesterday");
  assert.equal(recencyGroup("2026-08-17T12:00:00Z", now), "Earlier this week");
  assert.equal(recencyGroup("2026-08-01T12:00:00Z", now), "Earlier");
});

test("open-task groups Overdue / Today / Upcoming / No date", () => {
  assert.equal(taskDueGroup(undefined), "No date");
  assert.equal(taskDueGroup("2020-01-01", "overdue"), "Overdue");
  assert.equal(taskDueGroup("2026-08-19", "today"), "Today");
  assert.equal(taskDueGroup("2026-08-20", "future"), "Upcoming");
});
