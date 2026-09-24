import assert from "node:assert/strict";
import { test } from "node:test";
import { isToolError } from "./mcp-io.js";
import { UrlIdentitySchema, ReceiptLookupSchema } from "./types.js";
import {
  RECEIPT_KIND_SYSTEM,
  RECEIPT_KINDS,
  RECEIPT_SYSTEMS,
  canonicalizeReceiptInData,
  receiptConflictError,
  receiptFromData,
  receiptUrlHomeError,
  urlReceiptHomeError,
} from "./receipt.js";

test("receiptFromData ignores missing or empty receipt", () => {
  assert.equal(receiptFromData({}), undefined);
  assert.equal(receiptFromData({ receipt: null }), undefined);
  assert.equal(receiptFromData({ receipt: {} }), undefined);
});

test("receiptFromData accepts closed pairing kinds", () => {
  const drafted = receiptFromData({
    receipt: { system: "gmail", id: "msg-fixture-draft-1", kind: "drafted" },
  });
  assert.equal(isToolError(drafted), false);
  assert.deepEqual(drafted, { system: "gmail", id: "msg-fixture-draft-1", kind: "drafted" });

  const sent = receiptFromData({
    receipt: { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" },
  });
  assert.equal(isToolError(sent), false);
  assert.deepEqual(sent, { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" });

  const booked = receiptFromData({
    receipt: { system: "calendar", id: "evt-fixture-1", kind: "booked" },
  });
  assert.equal(isToolError(booked), false);
  assert.deepEqual(booked, { system: "calendar", id: "evt-fixture-1", kind: "booked" });

  const moved = receiptFromData({
    receipt: { system: "calendar", id: "evt-fixture-1", kind: "moved" },
  });
  assert.equal(isToolError(moved), false);
  assert.deepEqual(moved, { system: "calendar", id: "evt-fixture-1", kind: "moved" });

  const cleared = receiptFromData({
    receipt: { system: "calendar", id: "evt-fixture-1", kind: "cleared" },
  });
  assert.equal(isToolError(cleared), false);
  assert.deepEqual(cleared, { system: "calendar", id: "evt-fixture-1", kind: "cleared" });

  assert.deepEqual(RECEIPT_SYSTEMS, ["gmail", "calendar"]);
  assert.deepEqual(RECEIPT_KINDS, ["drafted", "sent", "booked", "moved", "cleared"]);
  assert.deepEqual(RECEIPT_KIND_SYSTEM, {
    drafted: "gmail",
    sent: "gmail",
    booked: "calendar",
    moved: "calendar",
    cleared: "calendar",
  });
});

test("receiptFromData trims fields and refuses incomplete, unknown, or unpaired values", () => {
  const trimmed = receiptFromData({
    receipt: { system: "gmail", id: "  msg-fixture-sent-1  ", kind: "sent" },
  });
  assert.deepEqual(trimmed, { system: "gmail", id: "msg-fixture-sent-1", kind: "sent" });

  const missingKind = receiptFromData({ receipt: { system: "gmail", id: "msg-1" } });
  assert.equal(isToolError(missingKind), true);
  if (isToolError(missingKind)) {
    assert.match(missingKind.error, /requires system, id, and kind/);
    assert.match(missingKind.suggestion ?? "", /do not fetch or mirror/i);
  }

  const unknownSystem = receiptFromData({
    receipt: { system: "github", id: "x", kind: "sent" },
  });
  assert.equal(isToolError(unknownSystem), true);
  if (isToolError(unknownSystem)) {
    assert.match(unknownSystem.error, /Unknown receipt.system "github"/);
  }

  const unknownKind = receiptFromData({
    receipt: { system: "gmail", id: "msg-1", kind: "draft" },
  });
  assert.equal(isToolError(unknownKind), true);
  if (isToolError(unknownKind)) {
    assert.match(unknownKind.error, /Unknown receipt.kind "draft"/);
  }

  const unpaired = receiptFromData({
    receipt: { system: "calendar", id: "evt-1", kind: "sent" },
  });
  assert.equal(isToolError(unpaired), true);
  if (isToolError(unpaired)) {
    assert.match(unpaired.error, /does not pair/);
    assert.match(unpaired.suggestion ?? "", /drafted or sent goes with system gmail/i);
  }

  const unpairedBooked = receiptFromData({
    receipt: { system: "gmail", id: "msg-1", kind: "booked" },
  });
  assert.equal(isToolError(unpairedBooked), true);
  if (isToolError(unpairedBooked)) {
    assert.match(unpairedBooked.error, /does not pair/);
  }

  const notObject = receiptFromData({ receipt: "gmail:1" });
  assert.equal(isToolError(notObject), true);
});

test("receipt is distinct from url identity: url has no kind", () => {
  const keys = Object.keys(UrlIdentitySchema.shape);
  assert.deepEqual(keys, ["system", "id"]);
  assert.ok(!keys.includes("kind"));
});

test("search receipt lookup is system and id only", () => {
  const keys = Object.keys(ReceiptLookupSchema.shape);
  assert.deepEqual(keys, ["system", "id"]);
  assert.ok(!keys.includes("kind"));
});

test("receiptConflictError points at the live node", () => {
  const err = receiptConflictError("11111111-1111-4111-8111-111111111111", {
    system: "gmail",
    id: "msg-fixture-sent-1",
    kind: "sent",
  });
  assert.match(err.error, /gmail:msg-fixture-sent-1/);
  assert.match(err.error, /11111111-1111-4111-8111-111111111111/);
  assert.match(err.suggestion ?? "", /search with receipt/i);
});

test("same-node home errors name the other live owner", () => {
  const receiptHome = receiptUrlHomeError("11111111-1111-4111-8111-111111111111", {
    system: "calendar",
    id: "evt-fixture-1",
  });
  assert.match(receiptHome.error, /calendar:evt-fixture-1/);
  assert.match(receiptHome.error, /11111111-1111-4111-8111-111111111111/);
  assert.match(receiptHome.suggestion ?? "", /write data.receipt on that record/i);

  const urlHome = urlReceiptHomeError("22222222-2222-4222-8222-222222222222", {
    system: "calendar",
    id: "evt-fixture-1",
  });
  assert.match(urlHome.error, /calendar:evt-fixture-1/);
  assert.match(urlHome.error, /22222222-2222-4222-8222-222222222222/);
  assert.match(urlHome.suggestion ?? "", /do not split url and receipt/i);
});

test("canonicalizeReceiptInData persists trimmed system, id, and kind", () => {
  const canonical = canonicalizeReceiptInData({
    receipt: { system: "gmail", id: "  msg-fixture-sent-1  ", kind: "sent", extra: true },
  });
  assert.deepEqual(canonical.receipt, {
    system: "gmail",
    id: "msg-fixture-sent-1",
    kind: "sent",
    extra: true,
  });
});

test("canonicalizeReceiptInData drops receipt: null", () => {
  const cleared = canonicalizeReceiptInData({ due: "2026-08-21", receipt: null });
  assert.deepEqual(cleared, { due: "2026-08-21" });
});
