import { createPool } from "./client.js";
import { pruneActivity } from "./prune.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = createPool(databaseUrl);
const result = await pruneActivity(pool);
await pool.end();
console.log(
  `activity-prune: deleted ${result.deleted} (retention ${result.activity_retention_days} days, cutoff ${result.cutoff})`,
);
