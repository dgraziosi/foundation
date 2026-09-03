import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "./app.js";
import { Keyring } from "./keyring.js";

const databaseUrl = process.env.DATABASE_URL;

function asObject(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null) {
    return {};
  }
  const record = result as {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };
  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent as Record<string, unknown>;
  }
  const text = record.content?.find((part) => part.type === "text");
  if (text?.text) {
    return JSON.parse(text.text) as Record<string, unknown>;
  }
  return {};
}

async function poolForSchema(schema: string): Promise<Pool> {
  const admin = createPool(databaseUrl!);
  await admin.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const pool = createPool(databaseUrl!, { options: `-c search_path=${schema},public` });
  await migrate(pool);
  await seedSystemOntology(pool);
  return pool;
}

async function mcpClient(url: string, key: string) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `ApiKey ${key}` } },
  });
  const client = new Client({ name: "agent-keys-test", version: "0.1.0" });
  await client.connect(transport);
  return client;
}

test(
  "per-agent keys stamp actor, gate destructive tools, and 401 on a wrong key",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("agent_keys");
    const root = "root-secret-key";
    const chief = "chief-secret-key";
    const keeper = "keeper-secret-key";
    const app = createApp(
      pool,
      { FOUNDATION_API_KEY: root, FOUNDATION_DATA: "/tmp/foundation-agent-keys" },
      "mcp",
      Keyring.fromSecrets(root, [
        { secret: chief, name: "chief", actor_label: "Chief of Staff" },
        { secret: keeper, name: "vault-keeper", actor_label: "Vault Keeper", destructive: true },
      ]),
    );
    const httpServer = app.listen(0);
    await new Promise<void>((resolve) => httpServer.on("listening", () => resolve()));
    const address = httpServer.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const url = `${origin}/mcp`;

    const chiefClient = await mcpClient(url, chief);
    const keeperClient = await mcpClient(url, keeper);
    try {
      const missing = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(missing.status, 401);
      const wrong = await fetch(url, {
        method: "POST",
        headers: { authorization: "ApiKey nope", "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(wrong.status, 401);

      const boot = asObject(await chiefClient.callTool({ name: "bootstrap", arguments: {} }));
      const rules = boot.rules as { destructive_scope: boolean; actor_label: string };
      assert.equal(rules.destructive_scope, false);
      assert.equal(rules.actor_label, "Chief of Staff");

      const created = asObject(
        await chiefClient.callTool({
          name: "upsert",
          arguments: {
            type: "note",
            title: "Chief note",
            actor: "user",
            actor_label: "spoofed",
          },
        }),
      );
      assert.equal(created.error, undefined);
      const node = created.node as { id: string; title: string };
      assert.equal(node.title, "Chief note");

      const found = asObject(
        await chiefClient.callTool({
          name: "search",
          arguments: { query: "Chief note", type: "note" },
        }),
      );
      assert.ok(Array.isArray(found.hits) && found.hits.length >= 1);

      const diary = asObject(
        await chiefClient.callTool({
          name: "list_activity",
          arguments: { target: node.id },
        }),
      );
      const rows = diary.activities as Array<{ actor: string; actor_label: string | null }>;
      assert.ok(rows.some((row) => row.actor === "agent" && row.actor_label === "Chief of Staff"));
      assert.equal(rows.some((row) => row.actor_label === "spoofed"), false);

      const second = asObject(
        await keeperClient.callTool({
          name: "upsert",
          arguments: { type: "note", title: "Keeper note" },
        }),
      );
      const keeperNode = second.node as { id: string; updated_at: string };
      const keeperDiary = asObject(
        await keeperClient.callTool({
          name: "list_activity",
          arguments: { target: keeperNode.id },
        }),
      );
      const keeperRows = keeperDiary.activities as Array<{ actor_label: string | null }>;
      assert.ok(keeperRows.some((row) => row.actor_label === "Vault Keeper"));

      const refusedDelete = asObject(
        await chiefClient.callTool({
          name: "delete",
          arguments: { id: node.id },
        }),
      );
      assert.match(String(refusedDelete.error), /destructive scope/);

      const keeperGot = asObject(
        await keeperClient.callTool({
          name: "get",
          arguments: { id: keeperNode.id },
        }),
      );
      const deleted = asObject(
        await keeperClient.callTool({
          name: "delete",
          arguments: {
            id: keeperNode.id,
            base_updated_at: (keeperGot.node as { updated_at: string }).updated_at,
          },
        }),
      );
      assert.equal(deleted.ok, true);
      assert.equal(deleted.error, undefined);
    } finally {
      await chiefClient.close().catch(() => undefined);
      await keeperClient.close().catch(() => undefined);
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await pool.end();
    }
  },
);
