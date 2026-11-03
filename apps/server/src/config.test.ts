import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LEASE_TTL_SECONDS } from "@foundation/schema";
import {
  MIN_KEY_LENGTH,
  PUBLISHED_API_KEY,
  PUBLISHED_DATABASE_PASSWORD,
  keepAllowedEnv,
  loadConfig,
} from "./config.js";

const apiKey = "config-test-api-key-0123456789abcdef";
const viewKey = "config-test-view-key-0123456789abcdef";

const required = {
  FOUNDATION_API_KEY: apiKey,
  DATABASE_URL: "postgres://foundation:change-me@127.0.0.1:5432/foundation",
};

function refusal(env: NodeJS.ProcessEnv): string {
  try {
    loadConfig(env);
  } catch (error) {
    return (error as Error).message;
  }
  assert.fail("loadConfig should refuse this environment");
}

test("VIEW_HOST defaults to localhost, same as HOST", () => {
  const config = loadConfig(required);
  assert.equal(config.HOST, "127.0.0.1");
  assert.equal(config.VIEW_HOST, "127.0.0.1");
  assert.equal(config.PORT, 8787);
  assert.equal(config.VIEW_PORT, 8788);
  assert.deepEqual(config.FOUNDATION_ALLOWED_HOSTS, []);
  assert.equal(config.VIEW_PUBLIC_ORIGIN, undefined);
  assert.equal(config.FOUNDATION_ALLOW_CLEARTEXT, false);
});

test("VIEW_HOST=0.0.0.0 is an explicit off-box override", () => {
  const config = loadConfig({ ...required, VIEW_HOST: "0.0.0.0" });
  assert.equal(config.VIEW_HOST, "0.0.0.0");
  assert.equal(config.HOST, "127.0.0.1");
});

test("FOUNDATION_VIEW_KEY is optional; blank is unset", () => {
  const absent = loadConfig(required);
  assert.equal(absent.FOUNDATION_VIEW_KEY, undefined);

  const blank = loadConfig({ ...required, FOUNDATION_VIEW_KEY: "" });
  assert.equal(blank.FOUNDATION_VIEW_KEY, undefined);

  const whitespace = loadConfig({ ...required, FOUNDATION_VIEW_KEY: "   " });
  assert.equal(whitespace.FOUNDATION_VIEW_KEY, undefined);

  const set = loadConfig({ ...required, FOUNDATION_VIEW_KEY: `  ${viewKey}  ` });
  assert.equal(set.FOUNDATION_VIEW_KEY, viewKey);
});

test("published placeholders do not start the server", () => {
  assert.match(refusal({ ...required, FOUNDATION_API_KEY: PUBLISHED_API_KEY }), /FOUNDATION_API_KEY is the published example/);
  assert.match(
    refusal({ ...required, FOUNDATION_VIEW_KEY: PUBLISHED_API_KEY }),
    /FOUNDATION_VIEW_KEY is the published example/,
  );
  assert.match(
    refusal({
      ...required,
      DATABASE_URL: `postgres://foundation:${PUBLISHED_DATABASE_PASSWORD}@localhost:5432/foundation`,
    }),
    /DATABASE_URL uses the published example password/,
  );
  assert.match(
    refusal({ ...required, DATABASE_URL: `host=localhost user=foundation password=${PUBLISHED_DATABASE_PASSWORD}` }),
    /published example password/,
  );
});

test("keys shorter than 32 characters are refused when set", () => {
  const short = "x".repeat(MIN_KEY_LENGTH - 1);
  assert.match(refusal({ ...required, FOUNDATION_API_KEY: short }), /FOUNDATION_API_KEY needs at least 32 characters/);
  assert.match(refusal({ ...required, FOUNDATION_VIEW_KEY: short }), /FOUNDATION_VIEW_KEY needs at least 32 characters/);
  assert.match(refusal({ DATABASE_URL: required.DATABASE_URL }), /FOUNDATION_API_KEY is required/);
  assert.equal(loadConfig({ ...required, FOUNDATION_API_KEY: "y".repeat(MIN_KEY_LENGTH) }).FOUNDATION_API_KEY.length, 32);
});

test("refusals never echo the secret they refused", () => {
  const short = "short-secret-do-not-echo";
  const message = refusal({ ...required, FOUNDATION_API_KEY: short, FOUNDATION_VIEW_KEY: short });
  assert.equal(message.includes(short), false);
  assert.equal(refusal({ ...required, FOUNDATION_VIEW_KEY: apiKey }).includes(apiKey), false);
});

test("the view key must differ from the API key", () => {
  assert.match(refusal({ ...required, FOUNDATION_VIEW_KEY: apiKey }), /FOUNDATION_VIEW_KEY must differ/);
});

test("database password has no length floor", () => {
  assert.ok(loadConfig({ ...required, DATABASE_URL: "postgres://foundation:ci-verify@127.0.0.1:5432/foundation" }));
  assert.ok(loadConfig({ ...required, DATABASE_URL: "postgres://foundation@/foundation?host=/tmp/sock" }));
});

test("FOUNDATION_ALLOWED_HOSTS names Host values and refuses a listen address", () => {
  const config = loadConfig({ ...required, FOUNDATION_ALLOWED_HOSTS: " Vault.Example.ts.net, 192.168.10.20:8788 " });
  assert.deepEqual(config.FOUNDATION_ALLOWED_HOSTS, ["vault.example.ts.net", "192.168.10.20:8788"]);
  assert.match(refusal({ ...required, FOUNDATION_ALLOWED_HOSTS: "0.0.0.0:8788" }), /0\.0\.0\.0 is a listen address/);
  assert.throws(() => loadConfig({ ...required, FOUNDATION_ALLOWED_HOSTS: "https://vault.example.ts.net/" }));
});

test("VIEW_PUBLIC_ORIGIN is a bare origin", () => {
  assert.equal(
    loadConfig({ ...required, VIEW_PUBLIC_ORIGIN: "https://Vault.Example.ts.net" }).VIEW_PUBLIC_ORIGIN,
    "https://vault.example.ts.net",
  );
  assert.equal(
    loadConfig({ ...required, VIEW_PUBLIC_ORIGIN: "http://192.168.10.20:8788/" }).VIEW_PUBLIC_ORIGIN,
    "http://192.168.10.20:8788",
  );
  assert.throws(() => loadConfig({ ...required, VIEW_PUBLIC_ORIGIN: "https://vault.example.ts.net/view" }));
  assert.throws(() => loadConfig({ ...required, VIEW_PUBLIC_ORIGIN: "http://0.0.0.0:8788" }));
  assert.throws(() => loadConfig({ ...required, VIEW_PUBLIC_ORIGIN: "vault.example.ts.net" }));
});

test("FOUNDATION_ALLOW_CLEARTEXT is an explicit opt-in", () => {
  assert.equal(loadConfig({ ...required, FOUNDATION_ALLOW_CLEARTEXT: "1" }).FOUNDATION_ALLOW_CLEARTEXT, true);
  assert.equal(loadConfig({ ...required, FOUNDATION_ALLOW_CLEARTEXT: "0" }).FOUNDATION_ALLOW_CLEARTEXT, false);
  assert.throws(() => loadConfig({ ...required, FOUNDATION_ALLOW_CLEARTEXT: "maybe" }));
});

test("FOUNDATION_LEASE_TTL_SECONDS defaults and refuses out of range", () => {
  const config = loadConfig(required);
  assert.equal(config.FOUNDATION_LEASE_TTL_SECONDS, DEFAULT_LEASE_TTL_SECONDS);

  const set = loadConfig({ ...required, FOUNDATION_LEASE_TTL_SECONDS: "120" });
  assert.equal(set.FOUNDATION_LEASE_TTL_SECONDS, 120);

  assert.throws(() => loadConfig({ ...required, FOUNDATION_LEASE_TTL_SECONDS: "10" }));
});

test("after loadConfig only the shell basics and EnvSchema names stay on the environment", () => {
  const env: NodeJS.ProcessEnv = {
    ...required,
    PATH: "/usr/bin",
    HOME: "/home/owner",
    LANG: "C.UTF-8",
    PGPASSWORD: "stray-password",
    AWS_SECRET_ACCESS_KEY: "stray-token",
    NODE_OPTIONS: "--require /tmp/evil.js",
  };
  keepAllowedEnv(env);
  assert.deepEqual(Object.keys(env).sort(), [...Object.keys(required), "HOME", "LANG", "PATH"].sort());
});
