import { type Pool } from "@foundation/db";
import { ActivityActionSchema, ActivityActorSchema } from "@foundation/schema";
import { activityChangeSummary } from "./view-write.js";

export const HOME_DIGEST_LIMIT = 5;
export const HOME_DIGEST_FIRST_VISIT_MS = 24 * 60 * 60 * 1000;

export type ViewDigestRow = {
  id: string;
  actor: string;
  actor_label: string | null;
  action: string;
  summary: string;
  title: string;
  target_id: string;
  created_at: string;
};

type DigestSqlRow = {
  id: string;
  actor: string;
  actor_label: string | null;
  action: string;
  target_id: string;
  before: unknown;
  after: unknown;
  created_at: Date | string;
  title: string;
};

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function firstVisitSince(now = new Date()): Date {
  return new Date(now.getTime() - HOME_DIGEST_FIRST_VISIT_MS);
}

export function digestWindow(input: { lookedAt?: Date; now?: Date }): {
  since: Date;
  exclusive: boolean;
} {
  if (input.lookedAt) {
    return { since: input.lookedAt, exclusive: true };
  }
  return { since: firstVisitSince(input.now), exclusive: false };
}

export async function viewHomeDigest(
  pool: Pool,
  input: { since: Date; exclusive: boolean; limit?: number },
): Promise<{ rows: ViewDigestRow[] }> {
  const limit = Math.min(Math.max(input.limit ?? HOME_DIGEST_LIMIT, 1), HOME_DIGEST_LIMIT);
  const cmp = input.exclusive ? ">" : ">=";
  const { rows } = await pool.query<DigestSqlRow>(
    `SELECT a.id, a.actor, a.actor_label, a.action, a.target_id, a.before, a.after, a.created_at, n.title
     FROM activity a
     INNER JOIN nodes n ON n.id::text = a.target_id AND n.deleted_at IS NULL
     WHERE a.actor <> 'user'
       AND a.target_kind = 'node'
       AND a.target_id IS NOT NULL
       AND a.created_at ${cmp} $1::timestamptz
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $2`,
    [input.since, limit],
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      actor: ActivityActorSchema.parse(row.actor),
      actor_label: row.actor_label,
      action: ActivityActionSchema.parse(row.action),
      summary: activityChangeSummary(row),
      title: row.title,
      target_id: row.target_id,
      created_at: asIso(row.created_at),
    })),
  };
}

export async function viewHomeDigestWindow(
  pool: Pool,
  lookedAt: Date | undefined,
  now = new Date(),
): Promise<{ rows: ViewDigestRow[]; looked_at: string }> {
  const window = digestWindow({ lookedAt, now });
  const digest = await viewHomeDigest(pool, { ...window, limit: HOME_DIGEST_LIMIT });
  return { rows: digest.rows, looked_at: now.toISOString() };
}
