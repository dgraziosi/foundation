import pg from "pg";

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}

export async function waitForDb(pool: pg.Pool, attempts = 30, delayMs = 1000): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Postgres not ready after ${attempts} attempts: ${String(lastError)}`);
}
