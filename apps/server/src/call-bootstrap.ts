import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const base = process.env.FOUNDATION_MCP_URL ?? `http://127.0.0.1:${config.PORT}/mcp`;
const scheme = process.env.FOUNDATION_AUTH_SCHEME ?? "ApiKey";

const transport = new StreamableHTTPClientTransport(new URL(base), {
  requestInit: {
    headers: {
      Authorization: `${scheme} ${config.FOUNDATION_API_KEY}`,
    },
  },
});

const client = new Client({ name: "foundation-bootstrap", version: "0.1.0" });
await client.connect(transport);
const result = await client.callTool({ name: "bootstrap", arguments: {} });
console.log(JSON.stringify(result, null, 2));
await client.close();
