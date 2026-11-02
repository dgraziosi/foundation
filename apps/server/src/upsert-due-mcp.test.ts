import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import {
  SEARCH_DUE_RULE,
  UPSERT_TOP_LEVEL_DUE_ERROR,
  UPSERT_TOP_LEVEL_DUE_SUGGESTION,
  UPSERT_TYPE_TITLE_RULE,
} from "@foundation/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
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

function unusedPool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
}

async function connectedClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = createMcpServer(unusedPool(), "/tmp/foundation-upsert-due", {
    name: "root",
    actor: "agent",
    actor_label: "root",
    destructive: true,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "upsert-due-test", version: "0.1.0" });
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

test("tools/call refuses top-level upsert due and tools/list omits it", async () => {
  const { client, close } = await connectedClient();
  try {
    const listed = await client.listTools();
    const upsert = listed.tools.find((tool) => tool.name === "upsert");
    assert.ok(upsert);
    assert.match(upsert.description ?? "", new RegExp(UPSERT_TYPE_TITLE_RULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const upsertProps = (upsert.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    assert.equal("due" in upsertProps, false);

    const search = listed.tools.find((tool) => tool.name === "search");
    assert.ok(search);
    assert.match(search.description ?? "", new RegExp(SEARCH_DUE_RULE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const dueSchema = (search.inputSchema as { properties?: { due?: { description?: string } } }).properties
      ?.due;
    assert.equal(dueSchema?.description, SEARCH_DUE_RULE);

    const refused = asObject(
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "upsert",
            arguments: {
              id: "11111111-1111-4111-8111-111111111111",
              type: "task",
              title: "Fixture due",
              base_updated_at: "2026-08-27T00:00:00.000Z",
              due: "2026-08-27",
            },
          },
        },
        CallToolResultSchema,
      ),
    );
    assert.equal(refused.error, UPSERT_TOP_LEVEL_DUE_ERROR);
    assert.equal(refused.suggestion, UPSERT_TOP_LEVEL_DUE_SUGGESTION);

    const batch = asObject(
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "upsert",
            arguments: {
              nodes: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  type: "task",
                  title: "Fixture due",
                  base_updated_at: "2026-08-27T00:00:00.000Z",
                  due: "2026-08-27",
                },
              ],
            },
          },
        },
        CallToolResultSchema,
      ),
    );
    assert.equal(batch.error, `nodes[0]: ${UPSERT_TOP_LEVEL_DUE_ERROR}`);
    assert.equal(batch.suggestion, UPSERT_TOP_LEVEL_DUE_SUGGESTION);
  } finally {
    await close();
  }
});
