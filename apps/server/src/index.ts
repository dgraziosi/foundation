import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createPool, migrate, seedSystemOntology, waitForDb } from "@foundation/db";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
await mkdir(join(config.FOUNDATION_DATA, "blobs"), { recursive: true });

const pool = createPool(config.DATABASE_URL);
await waitForDb(pool);
const ran = await migrate(pool);
await seedSystemOntology(pool);
if (ran.length) {
  console.log(`Applied migrations: ${ran.join(", ")}`);
}

const app = createApp(pool, config);
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`Foundation MCP listening on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`Health: http://${config.HOST}:${config.PORT}/health`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down`);
  server.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
