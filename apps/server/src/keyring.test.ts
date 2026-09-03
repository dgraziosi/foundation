import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  BOOTSTRAP_KEY_NAME,
  Keyring,
  hashApiKey,
  parseNamedKeysFile,
} from "./keyring.js";

test("bootstrap secret resolves as root with destructive scope", () => {
  const ring = Keyring.fromSecrets("root-secret", [], "Vault root");
  const got = ring.resolve("root-secret");
  assert.deepEqual(got, {
    name: BOOTSTRAP_KEY_NAME,
    actor: "agent",
    actor_label: "Vault root",
    destructive: true,
  });
  assert.equal(ring.resolve("nope"), undefined);
  assert.equal(ring.resolve(undefined), undefined);
});

test("memory named keys stamp their own actor and scopes", () => {
  const ring = Keyring.fromSecrets("root-secret", [
    { secret: "chief-secret", name: "chief", actor_label: "Chief of Staff" },
    { secret: "keeper-secret", name: "vault-keeper", destructive: true },
  ]);
  const chief = ring.resolve("chief-secret");
  assert.equal(chief?.name, "chief");
  assert.equal(chief?.actor_label, "Chief of Staff");
  assert.equal(chief?.destructive, false);
  const keeper = ring.resolve("keeper-secret");
  assert.equal(keeper?.actor_label, "vault-keeper");
  assert.equal(keeper?.destructive, true);
});

test("named file keys match sha256 and ignore a spoofed name", () => {
  const dir = join(tmpdir(), `foundation-keys-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "api-keys.json"),
    JSON.stringify({
      keys: [
        {
          name: "chief",
          secret_sha256: hashApiKey("chief-secret"),
          actor_label: "Chief of Staff",
          scopes: [],
        },
      ],
    }),
  );
  const ring = Keyring.fromBindings({
    FOUNDATION_API_KEY: "root-secret",
    FOUNDATION_DATA: dir,
  });
  const chief = ring.resolve("chief-secret");
  assert.equal(chief?.name, "chief");
  assert.equal(chief?.actor_label, "Chief of Staff");
  assert.equal(chief?.destructive, false);
  assert.equal(ring.resolve("root-secret")?.name, BOOTSTRAP_KEY_NAME);
});

test("parseNamedKeysFile refuses root, unknown scopes, and bad hashes", () => {
  assert.match(
    (parseNamedKeysFile(`{"keys":[{"name":"root","secret_sha256":"${"a".repeat(64)}","scopes":[]}]}`) as { error: string })
      .error,
    /reserved/,
  );
  assert.match(
    (parseNamedKeysFile(`{"keys":[{"name":"chief","secret_sha256":"nope","scopes":[]}]}`) as { error: string }).error,
    /secret_sha256/,
  );
  assert.match(
    (
      parseNamedKeysFile(
        `{"keys":[{"name":"chief","secret_sha256":"${"a".repeat(64)}","scopes":["admin"]}]}`,
      ) as { error: string }
    ).error,
    /unknown scope/,
  );
});
