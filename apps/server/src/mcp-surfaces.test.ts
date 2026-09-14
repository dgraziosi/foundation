import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "@foundation/db";
import {
  ADVERTISED_MCP_TOOL_NAMES,
  STARTER_MCP_PROMPT_NAMES,
  advertisedMcpPrompt,
  advertisedMcpPromptBody,
  advertisedMcpResource,
} from "@foundation/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp.js";

function unusedPool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
}

async function connectedClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const server = createMcpServer(unusedPool(), "/tmp/foundation-mcp-surfaces", {
    name: "root",
    actor: "agent",
    actor_label: "root",
    destructive: true,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "mcp-surfaces-test", version: "0.1.0" });
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

test("tools/list still advertises the 16 inventory tools", async () => {
  const { client, close } = await connectedClient();
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.deepEqual(names, [...ADVERTISED_MCP_TOOL_NAMES]);
    assert.equal(names.length, 16);
  } finally {
    await close();
  }
});

test("resources/list and resources/read serve product guidance", async () => {
  const { client, close } = await connectedClient();
  try {
    const listed = await client.listResources();
    assert.ok(listed.resources.length > 0);
    const uris = listed.resources.map((row) => row.uri);
    assert.ok(uris.includes("foundation://guidance/nodes"));
    assert.ok(uris.includes("foundation://guidance/how-to-extend"));
    const read = await client.readResource({ uri: "foundation://guidance/nodes" });
    const text = read.contents.map((part) => ("text" in part ? part.text : "")).join("");
    const catalog = advertisedMcpResource("foundation://guidance/nodes");
    assert.equal(text, catalog.text);
    assert.match(text, /data\.url: null clears the href/);
    assert.match(text, /# Nodes/);
  } finally {
    await close();
  }
});

test("prompts/list and prompts/get serve the starter bot recipes", async () => {
  const { client, close } = await connectedClient();
  try {
    const listed = await client.listPrompts();
    const names = listed.prompts.map((row) => row.name);
    for (const name of STARTER_MCP_PROMPT_NAMES) {
      assert.ok(names.includes(name), name);
    }
    const got = await client.getPrompt({ name: "chief" });
    const text = got.messages
      .map((message) => (message.content.type === "text" ? message.content.text : ""))
      .join("");
    assert.equal(text, advertisedMcpPromptBody(advertisedMcpPrompt("chief")));
    assert.match(text, /# Chief of Staff/);
    assert.match(text, /## Job/);
  } finally {
    await close();
  }
});
