import assert from "node:assert/strict";
import { test } from "node:test";
import { dueTone, presentRecentRow } from "./view-data.js";
import type { Activity } from "@foundation/schema";

function activity(patch: Partial<Activity>): Activity {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    actor: "agent",
    actor_label: null,
    action: "create",
    target_kind: "node",
    target_id: "22222222-2222-4222-8222-222222222222",
    before: null,
    after: { title: "Fixture note", type: "note" },
    reversible: true,
    undo_token: null,
    token_expires_at: null,
    undone_at: null,
    rationale: null,
    created_at: "2026-08-19T00:00:00.000Z",
    ...patch,
  };
}

test("dueTone marks overdue, today, and future", () => {
  assert.equal(dueTone("2026-08-01", "2026-08-19"), "overdue");
  assert.equal(dueTone("2026-08-19", "2026-08-19"), "today");
  assert.equal(dueTone("2026-08-20", "2026-08-19"), "future");
});

test("presentRecentRow uses node title for create/update", () => {
  const row = presentRecentRow(activity({}), new Map());
  assert.equal(row.summary, "Fixture note");
  assert.equal(row.title, "Fixture note");
  assert.equal(row.type, "note");
  assert.equal(row.node_id, "22222222-2222-4222-8222-222222222222");
});

test("presentRecentRow formats link and unlink when both titles exist", () => {
  const from = "33333333-3333-4333-8333-333333333333";
  const to = "44444444-4444-4444-8444-444444444444";
  const titles = new Map([
    [from, { title: "Fixture task", type: "task" }],
    [to, { title: "Fixture project", type: "project" }],
  ]);
  const linked = presentRecentRow(
    activity({
      action: "link",
      target_kind: "edge",
      target_id: "55555555-5555-4555-8555-555555555555",
      after: { from_id: from, to_id: to, relation_type: "child_of" },
    }),
    titles,
  );
  assert.equal(linked.summary, "Linked Fixture task → Fixture project");
  assert.equal(linked.node_id, from);

  const unlinked = presentRecentRow(
    activity({
      action: "unlink",
      target_kind: "edge",
      after: null,
      before: { from_id: from, to_id: to, relation_type: "child_of" },
    }),
    titles,
  );
  assert.equal(unlinked.summary, "Unlinked Fixture task → Fixture project");
});
