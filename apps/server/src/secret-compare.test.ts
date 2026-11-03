import assert from "node:assert/strict";
import { test } from "node:test";
import { hashApiKey } from "./keyring.js";
import { digestsMatch, secretDigest, secretDigestFromHex } from "./secret-compare.js";

test("digests are 32 bytes whatever the secret length", () => {
  for (const secret of ["a", "x".repeat(32), "y".repeat(4096)]) {
    assert.equal(secretDigest(secret).length, 32);
  }
});

test("equal secrets match; a different or longer secret does not", () => {
  const key = "k".repeat(40);
  assert.equal(digestsMatch(secretDigest(key), secretDigest(key)), true);
  assert.equal(digestsMatch(secretDigest(key), secretDigest(`${key}k`)), false);
  assert.equal(digestsMatch(secretDigest(key), secretDigest("short")), false);
});

test("a stored sha256 hex parses to the same digest as the secret", () => {
  const stored = secretDigestFromHex(hashApiKey("chief-secret"));
  assert.ok(stored);
  assert.equal(digestsMatch(secretDigest("chief-secret"), stored), true);
  assert.equal(digestsMatch(secretDigest("other-secret"), stored), false);
  assert.equal(secretDigestFromHex("nope"), undefined);
  assert.equal(secretDigestFromHex("A".repeat(64)), undefined);
});
