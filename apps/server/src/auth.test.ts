import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { requireApiKey } from "./auth.js";

test("ApiKey header is accepted; missing or wrong key is 401", async () => {
  const app = express();
  app.use(express.json());
  app.use("/mcp", requireApiKey("secret-key"));
  app.post("/mcp", (_req, res) => {
    res.json({ ok: true });
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
