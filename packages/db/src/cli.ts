import { createPool } from "./client.js";
import { migrate } from "./migrate.js";
import { seedSystemOntology } from "./seed.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = createPool(databaseUrl);
const ran = await migrate(pool);
await seedSystemOntology(pool);
await pool.end();
console.log(`Migrations applied: ${ran.length ? ran.join(", ") : "(none pending)"}; system ontology seeded.`);
