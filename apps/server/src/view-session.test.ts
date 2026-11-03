import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import { createApp } from "./app.js";
import { viewSessionCookieHeader } from "./auth.js";
import { windowLockOf } from "./view-door.js";
import { VIEW_SESSIONS_FILE, ViewSessions, browserIsHttps } from "./view-session.js";

const apiKey = "session-test-api-key-0123456789abcdef";
const viewKey = "session-test-view-key-0123456789abcdef";
const lock = windowLockOf({ FOUNDATION_VIEW_KEY: viewKey });

function stubPool(): Pool {
  return { query: async () => ({ rows: [{ "?column?": 1 }] }) } as unknown as Pool;
}

test("a minted session is a random id; disk keeps only its hash at mode 600", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-session-"));
  const sessions = ViewSessions.open(dataDir, lock);
  const id = sessions.mint();
  assert.notEqual(id, viewKey);
  assert.ok(id.length >= 43);
  assert.equal(sessions.resolve(id), true);
  assert.equal(sessions.resolve(viewKey), false);
  assert.equal(sessions.resolve(undefined), false);
  assert.notEqual(sessions.mint(), id);

  const path = join(dataDir, VIEW_SESSIONS_FILE);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes(id), false);
  assert.equal(raw.includes(viewKey), false);
  const stored = JSON.parse(raw) as { sessions: Array<{ sha256: string; expires_at: number }> };
  assert.equal(stored.sessions.length, 2);
  assert.ok(stored.sessions.every((row) => /^[0-9a-f]{64}$/.test(row.sha256)));
});

test("a session outlives a restart and ends after Max-Age", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-session-restart-"));
  let now = 1_000_000;
  const clock = { now: () => now };
  const id = ViewSessions.open(dataDir, lock, { clock }).mint();

  const restarted = ViewSessions.open(dataDir, lock, { clock });
  assert.equal(restarted.resolve(id), true);
  now += 2592000 * 1000 - 1;
  assert.equal(restarted.resolve(id), true);
  now += 1;
  assert.equal(restarted.resolve(id), false);
});

test("rotating the view key ends every session; a closed window resolves none", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-session-rotate-"));
  const id = ViewSessions.open(dataDir, lock).mint();
  const rotated = ViewSessions.open(dataDir, windowLockOf({ FOUNDATION_VIEW_KEY: `${viewKey}-rotated` }));
  assert.equal(rotated.resolve(id), false);
  const closed = ViewSessions.open(dataDir, windowLockOf({}));
  assert.equal(closed.resolve(id), false);
  assert.throws(() => closed.mint());
});

test("the cookie keeps Max-Age=2592000 and sets Secure only on HTTPS", () => {
  const plain = viewSessionCookieHeader("abc", false);
  assert.equal(plain, "foundation_key=abc; Path=/view; HttpOnly; SameSite=Strict; Max-Age=2592000");
  assert.equal(viewSessionCookieHeader("abc", true), `${plain}; Secure`);

  const publicOrigin = "https://vault.example.ts.net";
  assert.equal(browserIsHttps({ secure: false, headers: { host: "127.0.0.1:8788" } }, undefined), false);
  assert.equal(browserIsHttps({ secure: false, headers: { host: "127.0.0.1:8788" } }, publicOrigin), false);
  assert.equal(browserIsHttps({ secure: true, headers: { host: "127.0.0.1:8788" } }, undefined), true);
  assert.equal(browserIsHttps({ secure: false, headers: { host: "vault.example.ts.net" } }, publicOrigin), true);
  assert.equal(
    browserIsHttps({ secure: false, headers: { host: "192.168.10.20:8788" } }, "http://192.168.10.20:8788"),
    false,
  );
});

test("unlock sets a session cookie that is not the view key and does not open /mcp", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-session-app-"));
  const bindings = { FOUNDATION_API_KEY: apiKey, FOUNDATION_VIEW_KEY: viewKey, FOUNDATION_DATA: dataDir };
  const server = createApp(stubPool(), bindings, "mcp").listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const unlock = await fetch(`${origin}/view/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ api_key: viewKey }),
    });
    assert.equal(unlock.status, 200);
    const setCookie = unlock.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Max-Age=2592000/);
    assert.doesNotMatch(setCookie, /Secure/);
    assert.equal(setCookie.includes(viewKey), false);
    assert.equal(setCookie.includes(encodeURIComponent(viewKey)), false);
    const cookie = setCookie.split(";")[0]!;

    const session = await fetch(`${origin}/view/api/session`, { headers: { cookie } });
    assert.equal(session.status, 200);

    const rawKeyCookie = await fetch(`${origin}/view/api/session`, {
      headers: { cookie: `foundation_key=${encodeURIComponent(viewKey)}` },
    });
    assert.equal(rawKeyCookie.status, 401);

    const mcp = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(mcp.status, 401);

    const restarted = createApp(stubPool(), bindings, "view").listen(0);
    await new Promise<void>((resolve) => restarted.once("listening", () => resolve()));
    const restartedAddress = restarted.address();
    assert.ok(restartedAddress && typeof restartedAddress === "object");
    try {
      const again = await fetch(`http://127.0.0.1:${restartedAddress.port}/view/api/session`, { headers: { cookie } });
      assert.equal(again.status, 200);
    } finally {
      await new Promise<void>((resolve) => restarted.close(() => resolve()));
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
