import { createPool, ensureBlobLayout, migrate, seedSystemOntology, waitForDb } from "@foundation/db";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { Keyring } from "./keyring.js";
import { ViewDoor } from "./view-door.js";

const config = loadConfig();
await ensureBlobLayout(config.FOUNDATION_DATA);

const pool = createPool(config.DATABASE_URL);
await waitForDb(pool);
const ran = await migrate(pool);
await seedSystemOntology(pool);
if (ran.length) {
  console.log(`Applied migrations: ${ran.join(", ")}`);
}

const keyring = Keyring.fromBindings(config);
const viewDoor = ViewDoor.fromBindings(config, keyring);

const mcp = createApp(pool, config, "mcp", keyring, viewDoor);
const view = createApp(pool, config, "view", keyring, viewDoor);

const mcpServer = mcp.listen(config.PORT, config.HOST, () => {
  console.log(`Foundation MCP listening on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`Health: http://${config.HOST}:${config.PORT}/health`);
  console.log(`Blobs:  http://${config.HOST}:${config.PORT}/blobs/:id`);
});

const viewServer = view.listen(config.VIEW_PORT, config.VIEW_HOST, () => {
  console.log(`View:   http://${config.VIEW_HOST}:${config.VIEW_PORT}/view`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down`);
  mcpServer.close();
  viewServer.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
