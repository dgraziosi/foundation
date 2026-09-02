import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import { createApp } from "./app.js";
import { API_KEY_COOKIE } from "./auth.js";

const apiKey = "health-test-key";
const bindings = {
  FOUNDATION_API_KEY: apiKey,
  FOUNDATION_DATA: "/tmp/foundation-health-test",
  HOST: "127.0.0.1",
  PORT: 8787,
  VIEW_HOST: "127.0.0.1",
  VIEW_PORT: 8788,
};

const publicKeys = ["ok", "service", "db"];

function stubPool(up: boolean): Pool {
  return {
    query: async () => {
      if (!up) {
        throw new Error("down");
      }
      return { rows: [{ "?column?": 1 }] };
    },
  } as unknown as Pool;
}

async function listenOrigin(app: ReturnType<typeof createApp>): Promise<{ origin: string; close: () => void }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => {
      server.close();
    },
  };
}

function assertPublicShape(body: Record<string, unknown>, db: "up" | "down"): void {
  assert.deepEqual(Object.keys(body), publicKeys);
  assert.equal(body.ok, db === "up");
  assert.equal(body.service, "foundation");
  assert.equal(body.db, db);
}

test("unauthenticated /health stays { ok, service, db }", async () => {
  const app = createApp(stubPool(true), bindings, "mcp");
  const { origin, close } = await listenOrigin(app);
  try {
    const none = await fetch(`${origin}/health`);
    assert.equal(none.status, 200);
    assertPublicShape((await none.json()) as Record<string, unknown>, "up");

    const wrong = await fetch(`${origin}/health`, { headers: { authorization: "ApiKey nope" } });
    assert.equal(wrong.status, 200);
    assertPublicShape((await wrong.json()) as Record<string, unknown>, "up");

    const cookie = await fetch(`${origin}/health`, {
      headers: { cookie: `${API_KEY_COOKIE}=${apiKey}` },
    });
    assert.equal(cookie.status, 200);
    assertPublicShape((await cookie.json()) as Record<string, unknown>, "up");
  } finally {
    close();
  }
});

test("matching MCP header may add bind and data keys; never 401", async () => {
  const app = createApp(stubPool(true), bindings, "mcp");
  const { origin, close } = await listenOrigin(app);
  try {
    const apiKeyRes = await fetch(`${origin}/health`, { headers: { authorization: `ApiKey ${apiKey}` } });
    assert.equal(apiKeyRes.status, 200);
    const keyed = (await apiKeyRes.json()) as Record<string, unknown>;
    assert.equal(keyed.ok, true);
    assert.equal(keyed.service, "foundation");
    assert.equal(keyed.db, "up");
    assert.equal(keyed.host, "127.0.0.1");
    assert.equal(keyed.port, 8787);
    assert.equal(keyed.view_host, "127.0.0.1");
    assert.equal(keyed.view_port, 8788);
    assert.equal(keyed.data, "/tmp/foundation-health-test");

    const bearer = await fetch(`${origin}/health`, { headers: { authorization: `Bearer ${apiKey}` } });
    assert.equal(bearer.status, 200);
    const bearerBody = (await bearer.json()) as Record<string, unknown>;
    assert.equal(bearerBody.host, "127.0.0.1");
    assert.equal(bearerBody.data, "/tmp/foundation-health-test");
  } finally {
    close();
  }
});

test("down db is 503 and public keys stay { ok, service, db }", async () => {
  const app = createApp(stubPool(false), bindings, "view");
  const { origin, close } = await listenOrigin(app);
  try {
    const res = await fetch(`${origin}/health`);
    assert.equal(res.status, 503);
    assertPublicShape((await res.json()) as Record<string, unknown>, "down");
  } finally {
    close();
  }
});
