import assert from "node:assert/strict";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
const apiKey = "test-foundation-key";

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

test(
  "MCP agent flow: bootstrap, upsert, link, search, list_activity, undo",
  { skip: !databaseUrl },
  async () => {
    if (!databaseUrl) {
      return;
    }
    const pool = await poolForSchema("slice4_mcp");
    const app = createApp(pool, {
      FOUNDATION_API_KEY: apiKey,
      DATABASE_URL: databaseUrl,
      FOUNDATION_DATA: "/tmp/foundation-mcp-test",
      PORT: 0,
      HOST: "127.0.0.1",
    });
    const httpServer = app.listen(0);
    await new Promise<void>((resolve) => httpServer.on("listening", () => resolve()));
    const address = httpServer.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/mcp`;

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `ApiKey ${apiKey}` } },
    });
    const client = new Client({ name: "foundation-slice-test", version: "0.1.0" });

    try {
      await client.connect(transport);

      const boot = asObject(await client.callTool({ name: "bootstrap", arguments: {} }));
      assert.equal((boot.spine as { diagram: string }).diagram, "area → project → goal → habit | task");
      assert.equal((boot.how_to_extend as { nodes: string }).nodes.includes("upsert"), true);
      assert.equal((boot.how_to_extend as { activity: string }).activity.includes("list_activity"), true);
      assert.equal((boot.how_to_extend as { search: string }).search.includes("full-text"), true);
      const howTo = boot.how_to_extend as { summary: string };
      assert.equal(howTo.summary.includes("operator routine"), true);
      assert.equal(howTo.summary.includes("Librarian"), true);
      assert.equal(howTo.summary.includes("Vault health"), true);
      assert.equal(howTo.summary.includes("Do not add get_vault_health"), true);

      const area = asObject(
        await client.callTool({
          name: "upsert",
          arguments: { type: "area", title: "Travel" },
        }),
      );
      assert.equal(area.error, undefined);
      const areaId = (area.node as { id: string }).id;

      const project = asObject(
        await client.callTool({
          name: "upsert",
          arguments: { type: "project", title: "Japan trip" },
        }),
      );
      const projectId = (project.node as { id: string }).id;

      const html =
        "<html><body><h1>Itinerary</h1><p>Day 1: arrive NRT</p></body></html>";
      const trip = asObject(
        await client.callTool({
          name: "upsert",
          arguments: {
            type: "trip",
            title: "Tokyo week",
            payload: { media_type: "text/html", storage: "inline", body: html },
          },
        }),
      );
      const tripId = (trip.node as { id: string }).id;
      assert.equal((trip.node as { payload: { body: string } }).payload.body, html);

      const linked = asObject(
        await client.callTool({
          name: "link",
          arguments: { from_id: projectId, to_id: areaId, relation_type: "child_of" },
        }),
      );
      assert.equal(linked.error, undefined);
      assert.equal((linked.edge as { relation_type: string }).relation_type, "child_of");

      const gotTrip = asObject(await client.callTool({ name: "get", arguments: { id: tripId } }));
      assert.equal((gotTrip.node as { payload: { body: string } }).payload.body, html);

      const type = asObject(
        await client.callTool({
          name: "manage_type",
          arguments: {
            action: "create",
            slug: "decision",
            description: "A choice we made",
            kind: "artifact",
          },
        }),
      );
      assert.equal((type.type as { slug: string }).slug, "decision");
      assert.equal((type.type as { is_system: boolean }).is_system, false);

      const used = asObject(
        await client.callTool({
          name: "upsert",
          arguments: {
            type: "decision",
            title: "Fly into NRT",
            payload: { media_type: "text/plain", storage: "inline", body: "cheaper than HND that week" },
          },
        }),
      );
      assert.equal((used.node as { type: string }).type, "decision");

      const ontology = asObject(
        await client.callTool({
          name: "inspect_ontology",
          arguments: { kind: "types" },
        }),
      );
      const slugs = (ontology.types as Array<{ slug: string }>).map((row) => row.slug);
      assert.ok(slugs.includes("decision"));
      assert.ok(slugs.includes("area"));

      const listed = asObject(
        await client.callTool({
          name: "list_activity",
          arguments: { action: "create", target: tripId },
        }),
      );
      const activities = listed.activities as Array<{ id: string; action: string; target_id: string }>;
      assert.ok(activities.some((row) => row.target_id === tripId && row.action === "create"));
      const tripCreateId = activities.find((row) => row.target_id === tripId)?.id;
      assert.ok(tripCreateId);

      const found = asObject(
        await client.callTool({
          name: "search",
          arguments: { query: "arrive NRT", type: "trip" },
        }),
      );
      const nodes = found.nodes as Array<{ id: string; type: string }>;
      assert.ok(nodes.some((node) => node.id === tripId && node.type === "trip"));

      const undone = asObject(
        await client.callTool({
          name: "undo",
          arguments: { id: tripCreateId, confirm: true },
        }),
      );
      assert.equal(undone.error, undefined);
      assert.equal(undone.ok, true);

      const missing = asObject(await client.callTool({ name: "get", arguments: { id: tripId } }));
      assert.equal(typeof missing.error, "string");

      const confirmGate = asObject(
        await client.callTool({
          name: "undo",
          arguments: { id: (project as { activity_id: string }).activity_id },
        }),
      );
      assert.match(String(confirmGate.error), /confirm: true/);
    } finally {
      await client.close().catch(() => undefined);
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await pool.end();
    }
  },
);
