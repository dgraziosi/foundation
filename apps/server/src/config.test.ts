import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LEASE_TTL_SECONDS } from "@foundation/schema";
import { loadConfig } from "./config.js";

const required = {
  FOUNDATION_API_KEY: "test-key",
  DATABASE_URL: "postgres://foundation:change-me@127.0.0.1:5432/foundation",
};

test("VIEW_HOST defaults to localhost, same as HOST", () => {
  const config = loadConfig(required);
  assert.equal(config.HOST, "127.0.0.1");
  assert.equal(config.VIEW_HOST, "127.0.0.1");
  assert.equal(config.PORT, 8787);
  assert.equal(config.VIEW_PORT, 8788);
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

  const set = loadConfig({ ...required, FOUNDATION_VIEW_KEY: "  vault-secret  " });
  assert.equal(set.FOUNDATION_VIEW_KEY, "vault-secret");
});

test("FOUNDATION_LEASE_TTL_SECONDS defaults and refuses out of range", () => {
  const config = loadConfig(required);
  assert.equal(config.FOUNDATION_LEASE_TTL_SECONDS, DEFAULT_LEASE_TTL_SECONDS);

  const set = loadConfig({ ...required, FOUNDATION_LEASE_TTL_SECONDS: "120" });
  assert.equal(set.FOUNDATION_LEASE_TTL_SECONDS, 120);

  assert.throws(() => loadConfig({ ...required, FOUNDATION_LEASE_TTL_SECONDS: "10" }));
});
