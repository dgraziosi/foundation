import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { requireApiKey } from "./auth.js";
import { Keyring } from "./keyring.js";
import { FailureLedger } from "./view-door.js";

const unauthorized = { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null };

async function listen(app: express.Express): Promise<{ origin: string; close: () => void }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

function post(url: string, authorization?: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: "{}",
  });
}

test("ApiKey header is accepted; missing or wrong key is 401", async () => {
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey(Keyring.fromSecrets("secret-key"), new FailureLedger()));
  app.post("/mcp", (req, res) => {
    res.json({ ok: true, actor_label: req.agent?.actor_label });
  });
  const { origin, close } = await listen(app);
  const url = `${origin}/mcp`;

  try {
    const denied = await post(url);
    assert.equal(denied.status, 401);

    const wrong = await post(url, "ApiKey nope");
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), unauthorized);

    const ok = await post(url, "ApiKey secret-key");
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { actor_label: string }).actor_label, "root");

    const bearer = await post(url, "Bearer secret-key");
    assert.equal(bearer.status, 200);
  } finally {
    close();
  }
});

test("a locked source gets 429 before any compare; a missing header never counts", async () => {
  const ring = Keyring.fromSecrets("secret-key");
  let compares = 0;
  const counting = {
    resolve(provided: string | undefined) {
      compares += 1;
      return ring.resolve(provided);
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey(counting, new FailureLedger()));
  app.post("/mcp", (_req, res) => {
    res.json({ ok: true });
  });
  const { origin, close } = await listen(app);
  const url = `${origin}/mcp`;

  try {
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await post(url)).status, 401, `missing ${i + 1}`);
    }
    assert.equal(compares, 0);

    for (let i = 0; i < 5; i += 1) {
      assert.equal((await post(url, "ApiKey nope")).status, 401, `wrong ${i + 1}`);
    }
    assert.equal(compares, 5);

    const locked = await post(url, "ApiKey nope");
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get("retry-after")) > 0);
    assert.deepEqual(await locked.json(), unauthorized);

    const rightKeyWhileLocked = await post(url, "ApiKey secret-key");
    assert.equal(rightKeyWhileLocked.status, 429);
    assert.equal(compares, 5);

    assert.equal((await post(url)).status, 401);
  } finally {
    close();
  }
});

test("a success does not reset another caller's failures on the same source", async () => {
  let now = 0;
  const ledger = new FailureLedger({ clock: { now: () => now } });
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey(Keyring.fromSecrets("secret-key"), ledger));
  app.post("/mcp", (_req, res) => {
    res.json({ ok: true });
  });
  const { origin, close } = await listen(app);
  const url = `${origin}/mcp`;

  try {
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await post(url, "ApiKey nope")).status, 401);
      assert.equal((await post(url, "ApiKey secret-key")).status, 200);
    }
    assert.equal((await post(url, "ApiKey nope")).status, 401);
    assert.equal((await post(url, "ApiKey secret-key")).status, 429);
    now = 15 * 60_000;
    assert.equal((await post(url, "ApiKey secret-key")).status, 200);
  } finally {
    close();
  }
});

test("blob 429 keeps the plain unauthorized body plus Retry-After", async () => {
  const app = express();
  app.get("/blobs/:id", requireApiKey(Keyring.fromSecrets("secret-key"), new FailureLedger()), (_req, res) => {
    res.json({ ok: true });
  });
  const { origin, close } = await listen(app);
  const url = `${origin}/blobs/11111111-1111-4111-8111-111111111111`;

  try {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await fetch(url, { headers: { authorization: "ApiKey nope" } })).status, 401);
    }
    const locked = await fetch(url, { headers: { authorization: "ApiKey nope" } });
    assert.equal(locked.status, 429);
    assert.ok(locked.headers.get("retry-after"));
    assert.deepEqual(await locked.json(), { error: "Unauthorized" });
  } finally {
    close();
  }
});

test("cookie foundation_key is not a credential for requireApiKey routes", async () => {
  const app = express();
  app.use(express.json());
  const ring = Keyring.fromSecrets("secret-key");
  const ledger = new FailureLedger();
  app.use("/mcp", requireApiKey(ring, ledger));
  app.post("/mcp", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/blobs/:id", requireApiKey(ring, ledger), (_req, res) => {
    res.json({ ok: true });
  });
  const { origin, close } = await listen(app);
  const cookie = "foundation_key=secret-key";

  try {
    const mcp = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(mcp.status, 401);

    const blob = await fetch(`${origin}/blobs/11111111-1111-4111-8111-111111111111`, {
      headers: { cookie },
    });
    assert.equal(blob.status, 401);

    const header = await post(`${origin}/mcp`, "ApiKey secret-key");
    assert.equal(header.status, 200);
  } finally {
    close();
  }
});

test("named keys authenticate and stamp their own actor", async () => {
  const ring = Keyring.fromSecrets("root-secret", [
    { secret: "chief-secret", name: "chief", actor_label: "Chief of Staff" },
  ]);
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey(ring, new FailureLedger()));
  app.post("/mcp", (req, res) => {
    res.json({ name: req.agent?.name, actor_label: req.agent?.actor_label, destructive: req.agent?.destructive });
  });
  const { origin, close } = await listen(app);
  try {
    const chief = await post(`${origin}/mcp`, "ApiKey chief-secret");
    assert.equal(chief.status, 200);
    assert.deepEqual(await chief.json(), {
      name: "chief",
      actor_label: "Chief of Staff",
      destructive: false,
    });
  } finally {
    close();
  }
});
