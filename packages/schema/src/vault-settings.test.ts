import assert from "node:assert/strict";
import { test } from "node:test";
import { DUE_TIMEZONE, todayInTimeZone } from "./due.js";
import {
  DEFAULT_VAULT_SETTINGS,
  SEARCH_LIMIT_DEFAULT,
  isIanaTimeZone,
  resolveVaultTimeZone,
  todayInVault,
} from "./vault-settings.js";

test("seed settings keep America/New_York and compiled caps", () => {
  assert.equal(DEFAULT_VAULT_SETTINGS.timezone, DUE_TIMEZONE);
  assert.equal(DEFAULT_VAULT_SETTINGS.timezone, "America/New_York");
  assert.equal(DEFAULT_VAULT_SETTINGS.search_limit_default, SEARCH_LIMIT_DEFAULT);
  assert.equal(DEFAULT_VAULT_SETTINGS.working_set_limit_default, 40);
  assert.equal(DEFAULT_VAULT_SETTINGS.working_set_depth_default, 1);
  assert.equal(DEFAULT_VAULT_SETTINGS.working_set_due_within_days, 14);
  assert.equal(DEFAULT_VAULT_SETTINGS.spine_root_type_slug, null);
  assert.equal(DEFAULT_VAULT_SETTINGS.spine_root_id, null);
});

test("todayInVault follows the given IANA zone, not a frozen NY string", () => {
  const now = new Date("2026-08-14T03:30:00Z");
  assert.equal(todayInTimeZone(DUE_TIMEZONE, now), "2026-08-13");
  assert.equal(todayInVault("America/New_York", now), "2026-08-13");
  assert.equal(todayInVault("Pacific/Auckland", now), "2026-08-14");
  assert.equal(todayInVault("not-a-zone", now), "2026-08-13");
});

test("isIanaTimeZone and resolveVaultTimeZone", () => {
  assert.equal(isIanaTimeZone("America/New_York"), true);
  assert.equal(isIanaTimeZone("Pacific/Honolulu"), true);
  assert.equal(isIanaTimeZone(""), false);
  assert.equal(isIanaTimeZone("Mars/Olympus"), false);
  assert.equal(resolveVaultTimeZone("Pacific/Auckland"), "Pacific/Auckland");
  assert.equal(resolveVaultTimeZone("nope"), DUE_TIMEZONE);
});
