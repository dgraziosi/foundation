import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createPool, migrate, seedSystemOntology, type Pool } from "@foundation/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "./app.js";

test("the server still registers thirteen tools", async () => {
  const register = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "tools/register.ts"),
    "utf8",
  );
  const names = [...register.matchAll(/register(\w+)Tool\(server/g)].map((match) => match[1]);
  assert.equal(names.length, 13);
  assert.deepEqual(names, [
    "Bootstrap",
    "Search",
    "Lookup",
    "Get",
    "Upsert",
    "Delete",
    "Link",
    "Unlink",
    "InspectOntology",
    "ManageType",
    "ManageRelation",
    "ListActivity",
    "Undo",
  ]);
});

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
    const pool = await poolForSchema("mcp_graph");
    const app = createApp(pool, {
      FOUNDATION_API_KEY: apiKey,
      FOUNDATION_DATA: "/tmp/foundation-mcp-test",
    });
    const httpServer = app.listen(0);
    await new Promise<void>((resolve) => httpServer.on("listening", () => resolve()));
    const address = httpServer.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/mcp`;

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `ApiKey ${apiKey}` } },
    });
    const client = new Client({ name: "foundation-mcp-test", version: "0.1.0" });

    try {
      await client.connect(transport);

      const boot = asObject(await client.callTool({ name: "bootstrap", arguments: {} }));
      assert.equal((boot.spine as { diagram: string }).diagram, "area → project → goal → habit | task");
      assert.match((boot.spine as { description: string }).description, /preferred placement, not a hard gate/);
      const bootSlugs = (boot.types as Array<{ slug: string }>).map((type) => type.slug);
      assert.ok(bootSlugs.includes("place"));
      assert.ok(bootSlugs.includes("company"));
      assert.match((boot.how_to_extend as { search: string }).search, /data_equals/);
      assert.equal((boot.how_to_extend as { nodes: string }).nodes.includes("upsert"), true);
      assert.equal((boot.how_to_extend as { activity: string }).activity.includes("list_activity"), true);
      assert.equal((boot.how_to_extend as { search: string }).search.includes("full-text"), true);
      assert.match((boot.how_to_extend as { lookup: string }).lookup, /lookup resolves/);
      assert.match((boot.how_to_extend as { links: string }).links, /edges\[\]/);
      assert.match((boot.how_to_extend as { links: string }).links, /one transaction writes all edges or none/);
      assert.match((boot.how_to_extend as { lookup: string }).lookup, /not a probability/);
      assert.match((boot.how_to_extend as { search: string }).search, /call lookup/);
      const howTo = boot.how_to_extend as { summary: string };
      assert.equal(howTo.summary.includes("instance routine"), true);
      assert.equal(howTo.summary.includes("docs/VAULT_HEALTH.md"), true);
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
          arguments: {
            from_id: projectId,
            to_id: areaId,
            relation_type: "child_of",
            from_base_updated_at: (project.node as { updated_at: string }).updated_at,
            to_base_updated_at: (area.node as { updated_at: string }).updated_at,
          },
        }),
      );
      assert.equal(linked.error, undefined);
      assert.equal((linked.edge as { relation_type: string }).relation_type, "child_of");
      const flatLinks = linked.links as Array<{ edge: { relation_type: string }; activity_id: string }>;
      assert.equal(flatLinks.length, 1);
      assert.equal(flatLinks[0]?.edge.relation_type, "child_of");
      assert.equal(flatLinks[0]?.activity_id, linked.activity_id);

      const note = asObject(
        await client.callTool({
          name: "upsert",
          arguments: { type: "note", title: "Trip notes" },
        }),
      );
      const batched = asObject(
        await client.callTool({
          name: "link",
          arguments: {
            edges: [
              {
                from_id: (note.node as { id: string }).id,
                to_id: tripId,
                relation_type: "inspired_by",
                from_base_updated_at: (note.node as { updated_at: string }).updated_at,
                to_base_updated_at: (trip.node as { updated_at: string }).updated_at,
              },
              {
                from_id: tripId,
                to_id: projectId,
                relation_type: "relates_to",
                from_base_updated_at: (trip.node as { updated_at: string }).updated_at,
                to_base_updated_at: (project.node as { updated_at: string }).updated_at,
              },
            ],
          },
        }),
      );
      assert.equal(batched.error, undefined);
      assert.equal(batched.edge, undefined);
      const batchLinks = batched.links as Array<{ edge: { relation_type: string }; activity_id: string }>;
      assert.equal(batchLinks.length, 2);
      assert.equal(batchLinks[0]?.edge.relation_type, "inspired_by");
      assert.equal(batchLinks[1]?.edge.relation_type, "relates_to");
      assert.notEqual(batchLinks[0]?.activity_id, batchLinks[1]?.activity_id);

      const gotTrip = asObject(await client.callTool({ name: "get", arguments: { id: tripId } }));
      assert.equal((gotTrip.node as { payload: { body: string } }).payload.body, html);

      const type = asObject(
        await client.callTool({
          name: "manage_type",
          arguments: {
            action: "create",
            slug: "waypoint",
            description: "A custom authored type used in this test",
            kind: "artifact",
          },
        }),
      );
      assert.equal((type.type as { slug: string }).slug, "waypoint");
      assert.equal((type.type as { is_system: boolean }).is_system, false);

      const used = asObject(
        await client.callTool({
          name: "upsert",
          arguments: {
            type: "waypoint",
            title: "Fly into NRT",
            payload: { media_type: "text/plain", storage: "inline", body: "cheaper than HND that week" },
          },
        }),
      );
      assert.equal((used.node as { type: string }).type, "waypoint");

      const ontology = asObject(
        await client.callTool({
          name: "inspect_ontology",
          arguments: { kind: "types" },
        }),
      );
      const slugs = (ontology.types as Array<{ slug: string }>).map((row) => row.slug);
      assert.ok(slugs.includes("waypoint"));
      assert.ok(slugs.includes("area"));
      assert.ok(slugs.includes("place"));
      assert.ok(slugs.includes("company"));

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

      const person = asObject(
        await client.callTool({
          name: "upsert",
          arguments: { type: "person", title: "Priya Shah", data: { aliases: ["Pree-uh"] } },
        }),
      );
      assert.equal(person.error, undefined);
      const looked = asObject(
        await client.callTool({
          name: "lookup",
          arguments: {
            type: "person",
            inputs: [
              { id: "a", name: "Priya Shah" },
              { id: "b", name: "Pree-uh" },
              { id: "c", name: "No such person xyz" },
            ],
          },
        }),
      );
      const results = looked.results as Array<{ input: { id?: string }; outcome: string }>;
      assert.equal(results.length, 3);
      assert.equal(results[0]?.outcome, "exact");
      assert.equal(results[1]?.outcome, "alias");
      assert.equal(results[2]?.outcome, "no_match");

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
