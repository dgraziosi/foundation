import assert from "node:assert/strict";
import { test } from "node:test";
import { secretDigest } from "./secret-compare.js";
import {
  FailureLedger,
  ViewDoor,
  attemptSourceFrom,
  presentedSecret,
  windowLockOf,
} from "./view-door.js";

const houseKey = "mcp-bootstrap-secret";
const viewKey = "viewer-vault-secret";
const namedKey = "chief-named-secret";
const budget = { maxFailures: 5, windowMs: 60_000, cooldownMs: 60_000 };

function exclusiveDoor(clock?: { now(): number }): ViewDoor {
  return ViewDoor.fromBindings({ FOUNDATION_VIEW_KEY: viewKey }, { budget, clock });
}

function closedDoor(clock?: { now(): number }): ViewDoor {
  return ViewDoor.fromBindings({}, { budget, clock });
}

function lockOut(door: ViewDoor, source: ReturnType<typeof attemptSourceFrom>): void {
  for (let i = 0; i < 5; i += 1) {
    assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse", `refuse ${i + 1}`);
  }
}

test("exclusive lock holds only the view key digest", () => {
  const lock = windowLockOf({ FOUNDATION_VIEW_KEY: viewKey });
  assert.equal(lock.mode, "exclusive");
  if (lock.mode !== "exclusive") {
    return;
  }
  assert.deepEqual(lock.viewerDigest, secretDigest(viewKey));
  assert.deepEqual(Object.keys(lock).sort(), ["mode", "viewerDigest"]);
});

test("missing or blank view key is a closed lock", () => {
  assert.deepEqual(windowLockOf({}), { mode: "closed" });
  assert.deepEqual(windowLockOf({ FOUNDATION_VIEW_KEY: "  " }), { mode: "closed" });
});

test("exclusive ignores the house key and named keys", () => {
  const door = exclusiveDoor();
  const source = attemptSourceFrom("203.0.113.9");
  assert.equal(door.tryUnlock(presentedSecret(houseKey), source).kind, "refuse");
  assert.equal(door.tryUnlock(presentedSecret(namedKey), source).kind, "refuse");
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "open");
  assert.equal(door.admit(presentedSecret(houseKey)), false);
  assert.equal(door.admit(presentedSecret(namedKey)), false);
  assert.equal(door.admit(presentedSecret(viewKey)), true);
});

test("closed lock refuses every presented secret and counts the tries", () => {
  const door = closedDoor();
  const source = attemptSourceFrom("203.0.113.10");
  for (const key of [houseKey, namedKey, viewKey, "nope", "another"]) {
    assert.equal(door.tryUnlock(presentedSecret(key), source).kind, "refuse");
    assert.equal(door.admit(presentedSecret(key)), false);
  }
  assert.equal(door.tryUnlock(presentedSecret(houseKey), source).kind, "throttle");
});

test("five missing secrets do not lock the window", () => {
  const door = exclusiveDoor();
  const source = attemptSourceFrom("203.0.113.14");
  for (let i = 0; i < 20; i += 1) {
    assert.equal(door.tryUnlock(undefined, source).kind, "refuse");
    assert.equal(door.tryUnlock(presentedSecret("   "), source).kind, "refuse");
  }
  for (let i = 0; i < 4; i += 1) {
    assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse");
  }
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "open");
});

test("admit does not count against the unlock ledger", () => {
  const door = exclusiveDoor();
  const source = attemptSourceFrom("203.0.113.11");
  for (let i = 0; i < 20; i += 1) {
    assert.equal(door.admit(presentedSecret("nope")), false);
    assert.equal(door.admit(undefined), false);
  }
  assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse");
});

test("a sixth try while locked throttles before any compare and does not extend the wait", () => {
  let now = 0;
  const door = exclusiveDoor({ now: () => now });
  const source = attemptSourceFrom("203.0.113.12");
  lockOut(door, source);
  const first = door.tryUnlock(presentedSecret("nope"), source);
  assert.deepEqual(first, { kind: "throttle", retryAfterSec: 60 });
  now = 10_000;
  assert.deepEqual(door.tryUnlock(presentedSecret("nope"), source), { kind: "throttle", retryAfterSec: 50 });
  assert.deepEqual(door.tryUnlock(undefined, source), { kind: "throttle", retryAfterSec: 50 });
});

test("the correct view key during cooldown is still throttled", () => {
  let now = 0;
  const door = exclusiveDoor({ now: () => now });
  const source = attemptSourceFrom("203.0.113.13");
  lockOut(door, source);
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "throttle");
  now = 59_999;
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "throttle");
  now = 60_000;
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "open");
  assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse");
});

test("ledgers are isolated per door and per source", () => {
  let now = 0;
  const clock = { now: () => now };
  const left = exclusiveDoor(clock);
  const right = exclusiveDoor(clock);
  const alice = attemptSourceFrom("203.0.113.15");
  const bob = attemptSourceFrom("203.0.113.16");
  lockOut(left, alice);
  assert.equal(left.tryUnlock(presentedSecret("nope"), alice).kind, "throttle");
  assert.equal(left.tryUnlock(presentedSecret("nope"), bob).kind, "refuse");
  assert.equal(right.tryUnlock(presentedSecret("nope"), alice).kind, "refuse");
  now = 60_000;
  assert.equal(left.tryUnlock(presentedSecret("nope"), alice).kind, "refuse");
});

test("failures older than the window fall out of the ledger", () => {
  let now = 0;
  const ledger = new FailureLedger({ budget, clock: { now: () => now } });
  const source = attemptSourceFrom("203.0.113.17");
  for (let i = 0; i < 4; i += 1) {
    ledger.fail(source);
  }
  now = 60_001;
  ledger.fail(source);
  assert.equal(ledger.lockedFor(source), undefined);
  for (let i = 0; i < 4; i += 1) {
    ledger.fail(source);
  }
  assert.equal(ledger.lockedFor(source), 60);
});
