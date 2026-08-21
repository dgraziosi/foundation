import { isToolError } from "@foundation/schema";
import type pg from "pg";

export type Queryable = pg.Pool | pg.PoolClient;

export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    // Tool errors are returned as values; COMMIT would persist side effects
    // (e.g. a blobs INSERT) from a failed upsert.
    if (isToolError(result)) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export function uniqueViolationConstraint(error: unknown): string | undefined {
  if (!isUniqueViolation(error)) {
    return undefined;
  }
  if (typeof error === "object" && error !== null && "constraint" in error) {
    const name = (error as { constraint?: unknown }).constraint;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23503"
  );
}
