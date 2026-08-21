import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActivitySchema,
  GetSuccessSchema,
  ListActivityInputSchema,
  ListActivitySuccessSchema,
  NodeSchema,
  UpsertInputSchema,
  WorkingSetInputSchema,
} from "./index.js";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID = "22222222-2222-4222-8222-222222222222";
const STAMP = "2026-08-21T00:00:00.000Z";

const fixtureNode = {
  id: NODE_ID,
  type: "note",
  title: "Fixture note",
  status: "active" as const,
  payload: { media_type: "text/markdown", storage: "inline" as const, body: "Due Friday. Wait on the permit." },
  data: {
    due: "2026-08-28",
    receipt: { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" },
  },
  metadata: {},
  created_at: STAMP,
  updated_at: STAMP,
  deleted_at: null,
};

/** Locked rewrite loop: get the picture, read activity, upsert the new short body. */
const rewriteLoop = {
  get: {
    node: fixtureNode,
    edges: [],
    suggested_links: [],
  },
  list_activity: {
    target: NODE_ID,
    limit: 50,
  },
  activities: {
    activities: [
      {
        id: ACTIVITY_ID,
        actor: "agent" as const,
        actor_label: "fixture-bot",
        action: "update" as const,
        target_kind: "node" as const,
        target_id: NODE_ID,
        before: {
          ...fixtureNode,
          payload: {
            media_type: "text/markdown",
            storage: "inline",
            body: "Opened the note.\nAsked about the permit.\nDue Friday.",
          },
        },
        after: fixtureNode,
        reversible: true,
        undo_token: "33333333-3333-4333-8333-333333333333",
        token_expires_at: "2026-08-28T00:00:00.000Z",
        undone_at: null,
        rationale: null,
        created_at: STAMP,
      },
    ],
  },
  upsert: {
    id: NODE_ID,
    type: "note",
    title: "Fixture note",
    payload: {
      media_type: "text/markdown",
      storage: "inline" as const,
      body: "Due Friday. Wait on the permit.",
    },
    base_updated_at: STAMP,
  },
};

test("get returns the current node and no activity list", () => {
  const keys = Object.keys(GetSuccessSchema.shape);
  assert.deepEqual(keys, ["node", "edges", "blob", "suggested_links"]);
  assert.ok(!keys.includes("activities"));
  const parsed = GetSuccessSchema.parse(rewriteLoop.get);
  NodeSchema.parse(parsed.node);
  assert.equal(parsed.node.payload.body, "Due Friday. Wait on the permit.");
  assert.equal(parsed.node.data.due, "2026-08-28");
  assert.deepEqual(parsed.node.data.receipt, {
    system: "gmail",
    id: "msg-fixture-sent-1",
    kind: "sent",
  });
});

test("list_activity reads one node's writes by target", () => {
  const keys = Object.keys(ListActivityInputSchema.shape);
  assert.deepEqual(keys, ["action", "target", "since", "limit"]);
  ListActivityInputSchema.parse(rewriteLoop.list_activity);
  const page = ListActivitySuccessSchema.parse(rewriteLoop.activities);
  const row = ActivitySchema.parse(page.activities[0]);
  assert.equal(row.target_id, NODE_ID);
  assert.equal(row.action, "update");
  assert.ok(row.before);
  assert.ok(row.after);
});

test("upsert rewrite is one node: replace payload, if-match from get", () => {
  assert.equal(UpsertInputSchema.shape.payload.isOptional(), true);
  assert.equal(UpsertInputSchema.shape.data.isOptional(), true);
  const parsed = UpsertInputSchema.parse(rewriteLoop.upsert);
  assert.equal(parsed.id, rewriteLoop.get.node.id);
  assert.equal(parsed.base_updated_at, rewriteLoop.get.node.updated_at);
  assert.equal(parsed.payload?.body, rewriteLoop.get.node.payload.body);
});

test("working_set has no age-decay input on this contract", () => {
  const keys = Object.keys(WorkingSetInputSchema.shape);
  assert.deepEqual(keys, ["id", "include_completed", "depth", "limit", "due_within_days"]);
  assert.ok(!keys.includes("since"));
  assert.ok(!keys.includes("stale_after_days"));
  assert.ok(!keys.includes("age_days"));
});
