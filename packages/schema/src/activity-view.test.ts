import assert from "node:assert/strict";
import { test } from "node:test";
import { activitySnapshotDiff, presentActivity, projectActivity } from "./activity-view.js";
import { ACTIVITY_SCHEMA_VERSION, type Activity } from "./types.js";

const NODE_ID = "11111111-1111-4111-8111-111111111111";

const beforeNode = {
  id: NODE_ID,
  type: "note",
  title: "Old title",
  status: "active",
  payload: { media_type: "text/plain", storage: "inline", body: "v1" },
  data: { due: "2026-08-01" },
};

const afterNode = {
  ...beforeNode,
  title: "New title",
  payload: { media_type: "text/plain", storage: "inline", body: "v2" },
};

const row: Activity = {
  id: "22222222-2222-4222-8222-222222222222",
  actor: "agent",
  actor_label: "fixture",
  action: "update",
  target_kind: "node",
  target_id: NODE_ID,
  before: beforeNode,
  after: afterNode,
  reversible: true,
  undo_token: "33333333-3333-4333-8333-333333333333",
  token_expires_at: "2026-08-28T00:00:00.000Z",
  undone_at: null,
  rationale: null,
  created_at: "2026-08-21T00:00:00.000Z",
  schema_version: ACTIVITY_SCHEMA_VERSION,
};

test("activitySnapshotDiff keeps a one-sided null snapshot", () => {
  assert.deepEqual(activitySnapshotDiff(null, afterNode), { before: null, after: afterNode });
  assert.deepEqual(activitySnapshotDiff(beforeNode, null), { before: beforeNode, after: null });
});

test("activitySnapshotDiff returns only changed top-level keys", () => {
  const diff = activitySnapshotDiff(beforeNode, afterNode);
  assert.deepEqual(diff, {
    before: { title: "Old title", payload: beforeNode.payload },
    after: { title: "New title", payload: afterNode.payload },
  });
});

test("projectActivity omits keys the caller did not ask for", () => {
  const projected = projectActivity(row, ["id", "action", "schema_version"]);
  assert.deepEqual(projected, {
    id: row.id,
    action: "update",
    schema_version: ACTIVITY_SCHEMA_VERSION,
  });
});

test("presentActivity default is the full row", () => {
  assert.deepEqual(presentActivity(row), row);
});

test("presentActivity applies diff_only then fields", () => {
  const lean = presentActivity(row, {
    diff_only: true,
    fields: ["id", "before", "after", "schema_version"],
  });
  assert.deepEqual(lean, {
    id: row.id,
    before: { title: "Old title", payload: beforeNode.payload },
    after: { title: "New title", payload: afterNode.payload },
    schema_version: ACTIVITY_SCHEMA_VERSION,
  });
});
