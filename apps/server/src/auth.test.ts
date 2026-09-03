import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { requireApiKey } from "./auth.js";
import { Keyring } from "./keyring.js";

test("ApiKey header is accepted; missing or wrong key is 401", async () => {
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey(Keyring.fromSecrets("secret-key")));
  app.post("/mcp", (req, res) => {
    res.json({ ok: true, actor_label: req.agent?.actor_label });
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mcp`;

  try {
    const denied = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 401);

    const wrong = await fetch(url, {
      method: "POST",
      headers: { authorization: "ApiKey nope", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(wrong.status, 401);

    const ok = await fetch(url, {
      method: "POST",
      headers: { authorization: "ApiKey secret-key", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { actor_label: string }).actor_label, "root");

    const bearer = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer secret-key", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(bearer.status, 200);
  } finally {
    server.close();
  }
});

test("cookie foundation_key is not a credential for requireApiKey routes", async () => {
  const app = express();
  app.use(express.json());
  const ring = Keyring.fromSecrets("secret-key");
  app.use("/mcp", requireApiKey(ring));
  app.post("/mcp", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/blobs/:id", requireApiKey(ring), (_req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
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

    const header = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { authorization: "ApiKey secret-key", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(header.status, 200);
  } finally {
    server.close();
  }
});

test("named keys authenticate and stamp their own actor", async () => {
  const ring = Keyring.fromSecrets("root-secret", [
    { secret: "chief-secret", name: "chief", actor_label: "Chief of Staff" },
  ]);
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey(ring));
  app.post("/mcp", (req, res) => {
    res.json({ name: req.agent?.name, actor_label: req.agent?.actor_label, destructive: req.agent?.destructive });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  try {
    const chief = await fetch(url, {
      method: "POST",
      headers: { authorization: "ApiKey chief-secret", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(chief.status, 200);
    assert.deepEqual(await chief.json(), {
      name: "chief",
      actor_label: "Chief of Staff",
      destructive: false,
    });
  } finally {
    server.close();
  }
});
