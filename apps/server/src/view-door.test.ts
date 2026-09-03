import assert from "node:assert/strict";
import { test } from "node:test";
import { Keyring } from "./keyring.js";
import {
  ViewDoor,
  attemptSourceFrom,
  presentedSecret,
  windowLockOf,
} from "./view-door.js";

const apiKey = "mcp-bootstrap-secret";
const viewKey = "viewer-vault-secret";
const namedKey = "chief-named-secret";
const dataDir = "/tmp/foundation-view-door-test";

const exclusiveBindings = {
  FOUNDATION_API_KEY: apiKey,
  FOUNDATION_VIEW_KEY: viewKey,
  FOUNDATION_DATA: dataDir,
};

const fallbackBindings = {
  FOUNDATION_API_KEY: apiKey,
  FOUNDATION_DATA: dataDir,
};

function ring(): Keyring {
  return Keyring.fromSecrets(apiKey, [{ secret: namedKey, name: "chief", actor_label: "Chief of Staff" }]);
}

function exclusiveDoor(opts?: { clock?: { now(): number } }): ViewDoor {
  return ViewDoor.fromBindings(exclusiveBindings, ring(), {
    budget: { maxFailures: 5, windowMs: 60_000, cooldownMs: 60_000 },
    clock: opts?.clock,
  });
}

function fallbackDoor(): ViewDoor {
  return ViewDoor.fromBindings(fallbackBindings, ring());
}

test("exclusive lock holds the vault key and no keyring", () => {
  const lock = windowLockOf(exclusiveBindings, ring());
  assert.equal(lock.mode, "exclusive");
  if (lock.mode !== "exclusive") {
    return;
  }
  assert.equal(lock.viewerSecret, viewKey);
  assert.equal("keyring" in lock, false);
});

test("blank view key is a fallback lock", () => {
  const lock = windowLockOf({ ...exclusiveBindings, FOUNDATION_VIEW_KEY: "  " }, ring());
  assert.equal(lock.mode, "fallback");
  if (lock.mode !== "fallback") {
    return;
  }
  assert.equal("viewerSecret" in lock, false);
});

test("exclusive ignores bootstrap and named MCP keys", () => {
  const door = exclusiveDoor();
  const source = attemptSourceFrom("203.0.113.9");
  assert.equal(door.tryUnlock(presentedSecret(apiKey), source).kind, "refuse");
  assert.equal(door.tryUnlock(presentedSecret(namedKey), source).kind, "refuse");
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "open");
  assert.equal(door.admit(presentedSecret(apiKey)), false);
  assert.equal(door.admit(presentedSecret(namedKey)), false);
  assert.equal(door.admit(presentedSecret(viewKey)), true);
});

test("fallback accepts bootstrap and named keys", () => {
  const door = fallbackDoor();
  const source = attemptSourceFrom("203.0.113.10");
  assert.equal(door.tryUnlock(presentedSecret(apiKey), source).kind, "open");
  assert.equal(door.tryUnlock(presentedSecret(namedKey), source).kind, "open");
  assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse");
  assert.equal(door.admit(presentedSecret(apiKey)), true);
  assert.equal(door.admit(presentedSecret(namedKey)), true);
  assert.equal(door.admit(presentedSecret(viewKey)), false);
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

test("five refuse then throttle; further wrong tries do not extend the wait", () => {
  let now = 0;
  const door = exclusiveDoor({ clock: { now: () => now } });
  const source = attemptSourceFrom("203.0.113.12");
  for (let i = 0; i < 5; i += 1) {
    assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse", `refuse ${i + 1}`);
  }
  const first = door.tryUnlock(presentedSecret("nope"), source);
  assert.equal(first.kind, "throttle");
  if (first.kind !== "throttle") {
    return;
  }
  assert.equal(first.retryAfterSec, 60);
  now = 10_000;
  const again = door.tryUnlock(presentedSecret("nope"), source);
  assert.equal(again.kind, "throttle");
  if (again.kind !== "throttle") {
    return;
  }
  assert.equal(again.retryAfterSec, 50);
});

test("the correct vault key opens and clears that source during cooldown", () => {
  const clock = { now: () => 0 };
  const door = exclusiveDoor({ clock });
  const source = attemptSourceFrom("203.0.113.13");
  for (let i = 0; i < 5; i += 1) {
    assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse");
  }
  assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "throttle");
  assert.equal(door.tryUnlock(presentedSecret(viewKey), source).kind, "open");
  assert.equal(door.tryUnlock(presentedSecret("nope"), source).kind, "refuse");
});

test("missing secret spends a failure", () => {
  const door = exclusiveDoor();
  const source = attemptSourceFrom("203.0.113.14");
  assert.equal(door.tryUnlock(undefined, source).kind, "refuse");
  assert.equal(door.tryUnlock(presentedSecret("   "), source).kind, "refuse");
});

test("ledgers are isolated per door and per source", () => {
  let now = 0;
  const clock = { now: () => now };
  const left = exclusiveDoor({ clock });
  const right = exclusiveDoor({ clock });
  const alice = attemptSourceFrom("203.0.113.15");
  const bob = attemptSourceFrom("203.0.113.16");
  for (let i = 0; i < 5; i += 1) {
    assert.equal(left.tryUnlock(presentedSecret("nope"), alice).kind, "refuse");
  }
  assert.equal(left.tryUnlock(presentedSecret("nope"), alice).kind, "throttle");
  assert.equal(left.tryUnlock(presentedSecret("nope"), bob).kind, "refuse");
  assert.equal(right.tryUnlock(presentedSecret("nope"), alice).kind, "refuse");
  now = 60_000;
  assert.equal(left.tryUnlock(presentedSecret("nope"), alice).kind, "refuse");
});
