import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import type { Request, Response } from "express";
import { AccessLog, accessLineOf, formatAccessLine, setAccessLabel } from "./access-log.js";
import { createApp } from "./app.js";

const apiKey = "access-log-test-api-key-0123456789abcdef";
const viewKey = "access-log-test-view-key-0123456789abcdef";

function stubPool(): Pool {
  return { query: async () => ({ rows: [{ "?column?": 1 }] }) } as unknown as Pool;
}

async function linesOf(path: string, count: number): Promise<string[]> {
  for (let i = 0; i < 100; i += 1) {
    const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : [];
    if (lines.length >= count) {
      return lines;
    }
    await delay(10);
  }
  assert.fail(`expected ${count} access lines`);
}

test("an access line is time, remote, label, route, and status", () => {
  const line = formatAccessLine({
    time: "2026-11-03T06:00:00.000Z",
    remote: "127.0.0.1",
    label: "root",
    route: "POST /mcp",
    status: 200,
  });
  assert.equal(line, "2026-11-03T06:00:00.000Z\t127.0.0.1\troot\tPOST /mcp\t200\n");
});

test("MCP uses the agent name; the window uses a non-secret label; the query string is dropped", () => {
  const now = new Date("2026-11-03T06:00:00.000Z");
  const mcp = accessLineOf(
    { originalUrl: "/mcp", method: "POST", agent: { name: "chief" }, socket: { remoteAddress: "127.0.0.1" } } as Request,
    { locals: {}, statusCode: 200 } as Response,
    now,
  );
  assert.equal(mcp.label, "chief");
  assert.equal(mcp.route, "POST /mcp");

  const res = { locals: {}, statusCode: 401 } as Response;
  setAccessLabel(res, "window");
  const windowLine = accessLineOf(
    { originalUrl: "/view/unlock?api_key=secret", method: "POST", socket: { remoteAddress: "127.0.0.1" } } as Request,
    res,
    now,
  );
  assert.equal(windowLine.label, "window");
  assert.equal(windowLine.route, "POST /view/unlock");
});

test("control characters in a route cannot forge a second line", () => {
  const line = formatAccessLine({
    time: "2026-11-03T06:00:00.000Z",
    remote: "127.0.0.1",
    label: "-",
    route: "GET /view/a\nfake\tline",
    status: 404,
  });
  assert.equal(line.split("\n").length, 2);
  assert.equal(line.split("\t").length, 5);
});

test("the log file is mode 600 under a 700 directory", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "foundation-access-"));
  const log = AccessLog.open(dataDir);
  log.write({ time: "2026-11-03T06:00:00.000Z", remote: "127.0.0.1", label: "window", route: "POST /view/unlock", status: 401 });
  assert.equal(readFileSync(log.path, "utf8"), "2026-11-03T06:00:00.000Z\t127.0.0.1\twindow\tPOST /view/unlock\t401\n");
  assert.equal(statSync(join(dataDir, "logs")).mode & 0o777, 0o700);
  assert.equal(statSync(log.path).mode & 0o777, 0o600);
});

test("a full log rotates and keeps a bounded number of old files", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "foundation-access-"));
  const log = AccessLog.open(dataDir, { maxBytes: 120, keep: 2 });
  for (let i = 0; i < 12; i += 1) {
    log.write({ time: "2026-11-03T06:00:00.000Z", remote: "127.0.0.1", label: "root", route: `GET /r${i}`, status: 200 });
  }
  assert.ok(statSync(log.path).size <= 120);
  assert.ok(existsSync(`${log.path}.1`));
  assert.ok(existsSync(`${log.path}.2`));
  assert.equal(existsSync(`${log.path}.3`), false);
  assert.equal(statSync(`${log.path}.1`).mode & 0o777, 0o600);
});

test("requests that carry a key, a view key, a session cookie, or api_key never put them in the log", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "foundation-access-"));
  const app = createApp(stubPool(), {
    FOUNDATION_API_KEY: apiKey,
    FOUNDATION_VIEW_KEY: viewKey,
    FOUNDATION_DATA: dataDir,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  try {
    const keyed = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(keyed.status, 400);

    const wrong = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-key-0123456789abcdef0123456789" },
    });
    assert.equal(wrong.status, 401);

    const unlock = await fetch(`${origin}/view/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: viewKey }),
    });
    assert.equal(unlock.status, 200);
    const sessionCookie = (unlock.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const sessionValue = sessionCookie.split("=")[1] ?? "";
    assert.ok(sessionValue.length > 20);

    const session = await fetch(`${origin}/view/api/session`, { headers: { Cookie: sessionCookie } });
    assert.equal(session.status, 200);

    const health = await fetch(`${origin}/health?api_key=${apiKey}`);
    assert.equal(health.status, 200);

    const lines = await linesOf(join(dataDir, "logs", "access.log"), 5);
    const text = lines.join("\n");
    for (const secret of [apiKey, viewKey, sessionValue, decodeURIComponent(sessionValue), "Bearer", "api_key", "foundation_key"]) {
      assert.equal(text.includes(secret), false, "a secret or credential name reached the access log");
    }
    for (const line of lines) {
      assert.equal(line.split("\t").length, 5);
    }
    assert.deepEqual(
      lines.map((line) => line.split("\t").slice(2)),
      [
        ["root", "POST /mcp", "400"],
        ["-", "POST /mcp", "401"],
        ["window", "POST /view/unlock", "200"],
        ["window", "GET /view/api/session", "200"],
        ["-", "GET /health", "200"],
      ],
    );
    assert.ok(lines.every((line) => line.split("\t")[1] === "127.0.0.1"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
