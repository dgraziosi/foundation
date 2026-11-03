import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import { createApp } from "./app.js";
import {
  bindRefusal,
  hostAllowed,
  hostPolicyOf,
  isAgentPath,
  isLoopbackBind,
  isViewPath,
  originAllowed,
} from "./security.js";

const apiKey = "security-test-api-key-0123456789abcdef";
const viewKey = "security-test-view-key-0123456789abcdef";

function stubPool(): Pool {
  return { query: async () => ({ rows: [{ "?column?": 1 }] }) } as unknown as Pool;
}

/** Node's fetch replaces a Host header with the URL's host, so a real Host needs node:http. */
async function sendWithHost(
  origin: string,
  path: string,
  host: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: IncomingHttpHeaders }> {
  const url = new URL(path, origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? "GET",
        headers: { ...init.headers, host },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}

test("view paths stay on the view door; mcp and blobs are agent paths", () => {
  assert.equal(isViewPath("/view"), true);
  assert.equal(isViewPath("/view/api/session"), true);
  assert.equal(isViewPath("/view/blobs/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isViewPath("/mcp"), false);
  assert.equal(isViewPath("/blobs/11111111-1111-4111-8111-111111111111"), false);
  assert.equal(isAgentPath("/mcp"), true);
  assert.equal(isAgentPath("/blobs/11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isAgentPath("/view/blobs/11111111-1111-4111-8111-111111111111"), false);
  assert.equal(isAgentPath("/view/api/graph"), false);
  assert.equal(isAgentPath("/health"), false);
});

test("Host is loopback with the door port, or a name the operator listed", () => {
  const none = hostPolicyOf({});
  assert.equal(hostAllowed(none, "127.0.0.1:8788", 8788), true);
  assert.equal(hostAllowed(none, "LOCALHOST:8788", 8788), true);
  assert.equal(hostAllowed(none, "[::1]:8788", 8788), true);
  assert.equal(hostAllowed(none, "127.0.0.1:8787", 8788), false);
  assert.equal(hostAllowed(none, "127.0.0.1", 8788), false);
  assert.equal(hostAllowed(none, "evil.example", 8788), false);
  assert.equal(hostAllowed(none, "evil.example:8788", 8788), false);
  assert.equal(hostAllowed(none, "0.0.0.0:8788", 8788), false);
  assert.equal(hostAllowed(none, "localhost", 80), true);

  const named = hostPolicyOf({
    FOUNDATION_ALLOWED_HOSTS: ["192.168.10.20:8788"],
    VIEW_PUBLIC_ORIGIN: "https://vault.example.ts.net",
  });
  assert.equal(hostAllowed(named, "192.168.10.20:8788", 8788), true);
  assert.equal(hostAllowed(named, "vault.example.ts.net", 8788), true);
  assert.equal(hostAllowed(named, "192.168.10.20:8787", 8788), false);
});

test("Origin on a view write is the door's own loopback origin or a named one", () => {
  const policy = hostPolicyOf({ VIEW_PUBLIC_ORIGIN: "https://vault.example.ts.net" });
  assert.equal(originAllowed(policy, "http://127.0.0.1:8788", 8788), true);
  assert.equal(originAllowed(policy, "http://localhost:8788", 8788), true);
  assert.equal(originAllowed(policy, "https://vault.example.ts.net", 8788), true);
  assert.equal(originAllowed(policy, "http://vault.example.ts.net", 8788), false);
  assert.equal(originAllowed(policy, "https://evil.example", 8788), false);
  assert.equal(originAllowed(policy, "null", 8788), false);
});

test("a foreign Host is refused before any route and sets no cookie", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-security-"));
  const bindings = { FOUNDATION_API_KEY: apiKey, FOUNDATION_VIEW_KEY: viewKey, FOUNDATION_DATA: dataDir };
  const server = createApp(stubPool(), bindings, "mcp").listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const unlockBody = JSON.stringify({ api_key: viewKey });
  const jsonHeaders = { "content-type": "application/json", accept: "application/json" };

  try {
    for (const host of ["evil.example", `evil.example:${address.port}`, `0.0.0.0:${address.port}`, "127.0.0.1"]) {
      const unlock = await sendWithHost(origin, "/view/unlock", host, {
        method: "POST",
        headers: jsonHeaders,
        body: unlockBody,
      });
      assert.equal(unlock.status, 403, host);
      assert.equal(unlock.headers["set-cookie"], undefined);

      const mcp = await sendWithHost(origin, "/mcp", host, {
        method: "POST",
        headers: { ...jsonHeaders, authorization: `ApiKey ${apiKey}` },
        body: "{}",
      });
      assert.equal(mcp.status, 403, host);
    }

    for (const host of [`127.0.0.1:${address.port}`, `localhost:${address.port}`]) {
      const ownHost = await sendWithHost(origin, "/health", host);
      assert.equal(ownHost.status, 200, host);
    }

    const foreignOrigin = await fetch(`${origin}/view/unlock`, {
      method: "POST",
      headers: { ...jsonHeaders, origin: "https://evil.example" },
      body: unlockBody,
    });
    assert.equal(foreignOrigin.status, 403);
    assert.equal(foreignOrigin.headers.get("set-cookie"), null);

    const foreignWrite = await fetch(`${origin}/view/api/journals/today`, {
      method: "POST",
      headers: { ...jsonHeaders, origin: "https://evil.example", authorization: `ApiKey ${viewKey}` },
      body: "{}",
    });
    assert.equal(foreignWrite.status, 403);

    const foreignRead = await fetch(`${origin}/view/api/session`, {
      headers: { origin: "https://evil.example", authorization: `ApiKey ${viewKey}` },
    });
    assert.equal(foreignRead.status, 200);

    const ownOrigin = await fetch(`${origin}/view/unlock`, {
      method: "POST",
      headers: { ...jsonHeaders, origin },
      body: unlockBody,
    });
    assert.equal(ownOrigin.status, 200);
    assert.match(ownOrigin.headers.get("set-cookie") ?? "", /foundation_key=/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("the tunnel Host of an https VIEW_PUBLIC_ORIGIN unlocks with a Secure cookie", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-security-tunnel-"));
  const publicOrigin = "https://vault.example.ts.net";
  const bindings = {
    FOUNDATION_API_KEY: apiKey,
    FOUNDATION_VIEW_KEY: viewKey,
    FOUNDATION_DATA: dataDir,
    VIEW_PUBLIC_ORIGIN: publicOrigin,
  };
  const server = createApp(stubPool(), bindings, "view").listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const unlock = await sendWithHost(origin, "/view/unlock", "vault.example.ts.net", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", origin: publicOrigin },
      body: JSON.stringify({ api_key: viewKey }),
    });
    assert.equal(unlock.status, 200);
    assert.match(unlock.headers["set-cookie"]?.[0] ?? "", /; Secure$/);

    const local = await fetch(`${origin}/view/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ api_key: viewKey }),
    });
    assert.equal(local.status, 200);
    assert.doesNotMatch(local.headers.get("set-cookie") ?? "", /Secure/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("bodies parse after the key check; Unlock parses small", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "foundation-security-body-"));
  const bindings = { FOUNDATION_API_KEY: apiKey, FOUNDATION_VIEW_KEY: viewKey, FOUNDATION_DATA: dataDir };
  const server = createApp(stubPool(), bindings, "mcp").listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const mcpHeaders = { "content-type": "application/json", accept: "application/json, text/event-stream" };

  try {
    const huge = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(33 * 1024 * 1024) } });
    const anonymous = await fetch(`${origin}/mcp`, { method: "POST", headers: mcpHeaders, body: huge });
    assert.equal(anonymous.status, 401);

    const blobSized = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { pad: "x".repeat(21 * 1024 * 1024) } },
    });
    const keyed = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { ...mcpHeaders, authorization: `ApiKey ${apiKey}` },
      body: blobSized,
    });
    assert.equal(keyed.status, 200);

    const malformed = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { ...mcpHeaders, authorization: `ApiKey ${apiKey}` },
      body: "{not json",
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      jsonrpc: "2.0",
      error: { code: -32700, message: "Bad request" },
      id: null,
    });

    const bigUnlock = await fetch(`${origin}/view/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ api_key: viewKey, pad: "x".repeat(17 * 1024) }),
    });
    assert.equal(bigUnlock.status, 413);
    assert.deepEqual(await bigUnlock.json(), { error: "Request body too large" });
    assert.equal(bigUnlock.headers.get("set-cookie"), null);

    const anonymousWrite = await fetch(`${origin}/view/api/nodes/11111111-1111-4111-8111-111111111111`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "x".repeat(1024 * 1024) }),
    });
    assert.equal(anonymousWrite.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a bind beyond loopback needs a named origin and TLS or a cleartext opt-in", () => {
  const local = { HOST: "127.0.0.1", VIEW_HOST: "127.0.0.1", FOUNDATION_ALLOW_CLEARTEXT: false };
  assert.equal(bindRefusal(local), undefined);
  assert.equal(isLoopbackBind("localhost"), true);
  assert.equal(isLoopbackBind("::1"), true);
  assert.equal(isLoopbackBind("0.0.0.0"), false);

  const offBox = { ...local, VIEW_HOST: "0.0.0.0" };
  assert.match(bindRefusal(offBox) ?? "", /VIEW_HOST=0\.0\.0\.0 listens beyond this machine\. Set VIEW_PUBLIC_ORIGIN/);
  assert.match(
    bindRefusal({ ...offBox, VIEW_PUBLIC_ORIGIN: "http://192.168.10.20:8788" }) ?? "",
    /FOUNDATION_ALLOW_CLEARTEXT=1/,
  );
  assert.equal(
    bindRefusal({ ...offBox, VIEW_PUBLIC_ORIGIN: "http://192.168.10.20:8788", FOUNDATION_ALLOW_CLEARTEXT: true }),
    undefined,
  );
  assert.equal(bindRefusal({ ...offBox, VIEW_PUBLIC_ORIGIN: "https://vault.example.ts.net" }), undefined);
  assert.match(bindRefusal({ ...local, HOST: "0.0.0.0" }) ?? "", /HOST=0\.0\.0\.0/);
});
