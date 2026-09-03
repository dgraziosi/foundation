import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RETIRED_IDENTITY_DATA_KEYS,
  hasLeftoverIdentityKeys,
  migrateLeftoverIdentity,
} from "./identity.js";

test("retired identity keys are living, code, origin, and link", () => {
  assert.deepEqual(RETIRED_IDENTITY_DATA_KEYS, ["living", "code", "origin", "link"]);
});

test("hasLeftoverIdentityKeys is true only when a retired bag is present", () => {
  assert.equal(hasLeftoverIdentityKeys(undefined), false);
  assert.equal(hasLeftoverIdentityKeys({}), false);
  assert.equal(hasLeftoverIdentityKeys({ repo: { system: "github", id: "repo-fixture-1" } }), false);
  assert.equal(hasLeftoverIdentityKeys({ living: { system: "drive", id: "file-fixture-1" } }), true);
  assert.equal(hasLeftoverIdentityKeys({ origin: null }), true);
});

test("migrateLeftoverIdentity maps living to url and strips the leftover key", () => {
  const next = migrateLeftoverIdentity(
    { living: { system: "drive", id: "file-fixture-1" }, keep: true },
    {},
  );
  assert.deepEqual(next.metadata.url, { system: "drive", id: "file-fixture-1" });
  assert.equal(next.data.living, undefined);
  assert.equal(next.data.keep, true);
});

test("migrateLeftoverIdentity maps code to repo and strips the leftover key", () => {
  const next = migrateLeftoverIdentity({ code: { system: "github", id: "repo-fixture-1" } }, {});
  assert.deepEqual(next.data.repo, { system: "github", id: "repo-fixture-1" });
  assert.equal(next.data.code, undefined);
});

test("migrateLeftoverIdentity maps origin by system into url or repo", () => {
  const drive = migrateLeftoverIdentity(
    { origin: { system: "drive", id: "file-fixture-1" } },
    {},
  );
  assert.deepEqual(drive.metadata.url, { system: "drive", id: "file-fixture-1" });
  assert.equal(drive.data.origin, undefined);

  const github = migrateLeftoverIdentity(
    { origin: { system: "github", id: "repo-fixture-1" } },
    {},
  );
  assert.deepEqual(github.data.repo, { system: "github", id: "repo-fixture-1" });
  assert.equal(github.data.origin, undefined);
});

test("migrateLeftoverIdentity maps link by system into url or repo", () => {
  const drive = migrateLeftoverIdentity(
    { link: { system: "gmail", id: "msg-fixture-1" } },
    {},
  );
  assert.deepEqual(drive.metadata.url, { system: "gmail", id: "msg-fixture-1" });
  assert.equal(drive.data.link, undefined);

  const github = migrateLeftoverIdentity(
    { link: { system: "github", id: "repo-fixture-1" } },
    {},
  );
  assert.deepEqual(github.data.repo, { system: "github", id: "repo-fixture-1" });
  assert.equal(github.data.link, undefined);
});

test("current url and repo win over leftover bags", () => {
  const next = migrateLeftoverIdentity(
    {
      living: { system: "drive", id: "file-fixture-leftover" },
      code: { system: "github", id: "repo-fixture-leftover" },
      repo: { system: "github", id: "repo-fixture-1" },
    },
    { url: { system: "calendar", id: "evt-fixture-1" } },
  );
  assert.deepEqual(next.metadata.url, { system: "calendar", id: "evt-fixture-1" });
  assert.deepEqual(next.data.repo, { system: "github", id: "repo-fixture-1" });
  assert.equal(next.data.living, undefined);
  assert.equal(next.data.code, undefined);
});

test("living wins over origin and link when several leftover bags map to url", () => {
  const next = migrateLeftoverIdentity(
    {
      living: { system: "drive", id: "file-fixture-living" },
      origin: { system: "gmail", id: "msg-fixture-origin" },
      link: { system: "calendar", id: "evt-fixture-link" },
    },
    {},
  );
  assert.deepEqual(next.metadata.url, { system: "drive", id: "file-fixture-living" });
  assert.equal(next.data.living, undefined);
  assert.equal(next.data.origin, undefined);
  assert.equal(next.data.link, undefined);
});

test("incomplete, unknown, and non-object leftover bags are stripped without a fill", () => {
  const next = migrateLeftoverIdentity(
    {
      living: "not-an-object",
      code: { system: "github" },
      origin: { system: "slack", id: "chan-1" },
      link: { system: "drive", id: "  " },
      keep: true,
    },
    {},
  );
  assert.equal(next.metadata.url, undefined);
  assert.equal(next.data.repo, undefined);
  assert.equal(next.data.living, undefined);
  assert.equal(next.data.code, undefined);
  assert.equal(next.data.origin, undefined);
  assert.equal(next.data.link, undefined);
  assert.equal(next.data.keep, true);
});

test("migrateLeftoverIdentity trims leftover system and id", () => {
  const next = migrateLeftoverIdentity(
    { living: { system: "  drive  ", id: "  file-fixture-1  " } },
    {},
  );
  assert.deepEqual(next.metadata.url, { system: "drive", id: "file-fixture-1" });
});
