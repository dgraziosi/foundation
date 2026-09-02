import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import {
  SEARCH_URL_STRING_SUGGESTION,
  URL_FIXTURE,
  URL_MISS_SUGGESTION,
} from "@foundation/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp.js";

function asObject(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null) {
    return {};
  }
  const record = result as {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent as Record<string, unknown>;
  }
  const text = record.content?.find((part) => part.type === "text");
  if (text?.text) {
    try {
      return JSON.parse(text.text) as Record<string, unknown>;
    } catch {
      return { text: text.text };
    }
  }
  return {};
}

function urlFilterAdvertisesString(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") {
    return false;
  }
  const node = schema as { type?: unknown; anyOf?: unknown[]; oneOf?: unknown[] };
  if (node.type === "string") {
    return true;
  }
  if (Array.isArray(node.type) && node.type.includes("string")) {
    return true;
  }
  return [...(node.anyOf ?? []), ...(node.oneOf ?? [])].some(urlFilterAdvertisesString);
}

function unusedPool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
}

async function connectedSearchClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = createMcpServer(unusedPool(), "/tmp/foundation-search-url-string");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "search-url-string-test", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

test("tools/call refuses a string search.url with { error, suggestion }", async () => {
  const { client, close } = await connectedSearchClient();
  try {
    const listed = await client.listTools();
    const search = listed.tools.find((tool) => tool.name === "search");
    assert.ok(search);
    const urlSchema = (search.inputSchema as { properties?: { url?: unknown } }).properties?.url;
    assert.ok(urlSchema);
    assert.equal(urlFilterAdvertisesString(urlSchema), false);

    const hrefOnly = await client.callTool({
      name: "search",
      arguments: { url: URL_FIXTURE },
    });
    assert.equal(hrefOnly.isError, true);
    const refused = asObject(hrefOnly);
    assert.equal(refused.error, "Invalid input");
    assert.match(String(refused.suggestion), new RegExp(SEARCH_URL_STRING_SUGGESTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(String(refused.suggestion).includes("Input validation error"), false);
    const hrefDump = JSON.stringify(hrefOnly);
    assert.equal(hrefDump.includes("Input validation error"), false);
    assert.equal(hrefDump.includes("-32602"), false);

    const withQuery = asObject(
      await client.callTool({
        name: "search",
        arguments: { query: "Ada", url: URL_FIXTURE },
      }),
    );
    assert.equal(withQuery.error, "Invalid input");
    assert.match(String(withQuery.suggestion), new RegExp(SEARCH_URL_STRING_SUGGESTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const objectUrl = asObject(
      await client.callTool({
        name: "search",
        arguments: { url: { system: "drive", id: "file-fixture-1" } },
      }),
    );
    assert.equal(objectUrl.error, undefined);
    assert.deepEqual(objectUrl.nodes, []);
    assert.equal(objectUrl.suggestion, URL_MISS_SUGGESTION);

    const httpsEquals = asObject(
      await client.callTool({
        name: "search",
        arguments: { data_equals: { url: URL_FIXTURE } },
      }),
    );
    assert.equal(httpsEquals.error, undefined);
    assert.deepEqual(httpsEquals.nodes, []);
    assert.equal(httpsEquals.suggestion, undefined);
  } finally {
    await close();
  }
});
