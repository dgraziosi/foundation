import {
  ActivityActionSchema,
  ActivityActorSchema,
  ActivityTargetKindSchema,
  type Activity,
} from "@foundation/schema";
import { randomUUID } from "node:crypto";
import { iso, type Queryable } from "./tx.js";

export const UNDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ActivityRow = {
  id: string;
  actor: Activity["actor"];
  actor_label: string | null;
  action: Activity["action"];
  target_kind: Activity["target_kind"];
  target_id: string | null;
  before: unknown;
  after: unknown;
  reversible: boolean;
  undo_token: string | null;
  token_expires_at: Date | null;
  undone_at: Date | null;
  rationale: string | null;
  created_at: Date;
};

export function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    actor: ActivityActorSchema.parse(row.actor),
    actor_label: row.actor_label,
    action: ActivityActionSchema.parse(row.action),
    target_kind: ActivityTargetKindSchema.parse(row.target_kind),
    target_id: row.target_id,
    before: row.before,
    after: row.after,
    reversible: row.reversible,
    undo_token: row.undo_token,
    token_expires_at: row.token_expires_at ? iso(row.token_expires_at) : null,
    undone_at: row.undone_at ? iso(row.undone_at) : null,
    rationale: row.rationale,
    created_at: iso(row.created_at),
  };
}

const ACTIVITY_COLUMNS = `
  id, actor, actor_label, action, target_kind, target_id,
  before, after, reversible, undo_token, token_expires_at, undone_at,
  rationale, created_at
`;

export async function insertActivity(
  db: Queryable,
  row: {
    actor?: Activity["actor"];
    actor_label?: string | null;
    action: Activity["action"];
    target_kind: Activity["target_kind"];
    target_id: string | null;
    before?: unknown;
    after?: unknown;
    reversible?: boolean;
    rationale?: string | null;
  },
): Promise<{ id: string }> {
  const reversible = row.reversible ?? true;
  const undoToken = reversible ? randomUUID() : null;
  const expires = undoToken ? new Date(Date.now() + UNDO_TTL_MS) : null;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO activity (
       actor, actor_label, action, target_kind, target_id,
       before, after, reversible, undo_token, token_expires_at, rationale
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6::jsonb, $7::jsonb, $8, $9, $10, $11
     )
     RETURNING id`,
    [
      row.actor ?? "agent",
      row.actor_label ?? null,
      row.action,
      row.target_kind,
      row.target_id,
      row.before === undefined ? null : JSON.stringify(row.before),
      row.after === undefined ? null : JSON.stringify(row.after),
      reversible,
      undoToken,
      expires,
      row.rationale ?? null,
    ],
  );
  return { id: rows[0]!.id };
}

export async function getActivityById(
  db: Queryable,
  id: string,
  options: { forUpdate?: boolean } = {},
): Promise<Activity | undefined> {
  const { rows } = await db.query<ActivityRow>(
    `SELECT ${ACTIVITY_COLUMNS} FROM activity WHERE id = $1${options.forUpdate ? " FOR UPDATE" : ""}`,
    [id],
  );
  return rows[0] ? mapActivity(rows[0]) : undefined;
}

export async function listActivity(
  db: Queryable,
  filters: {
    action?: Activity["action"];
    target?: string;
    since?: Date;
    limit?: number;
  } = {},
): Promise<Activity[]> {
  const limit = filters.limit ?? 50;
  const { rows } = await db.query<ActivityRow>(
    `SELECT ${ACTIVITY_COLUMNS}
     FROM activity
     WHERE ($1::text IS NULL OR action = $1)
       AND ($2::text IS NULL OR target_id = $2)
       AND ($3::timestamptz IS NULL OR created_at >= $3)
     ORDER BY created_at DESC
     LIMIT $4`,
    [filters.action ?? null, filters.target ?? null, filters.since ?? null, limit],
  );
  return rows.map(mapActivity);
}

export async function markNodeDeleteActivitiesIrreversible(
  db: Queryable,
  nodeIds: string[],
): Promise<number> {
  if (nodeIds.length === 0) {
    return 0;
  }
  const { rowCount } = await db.query(
    `UPDATE activity
     SET reversible = false, undo_token = NULL
     WHERE action = 'delete'
       AND target_kind = 'node'
       AND target_id = ANY($1::text[])
       AND undone_at IS NULL
       AND reversible = true`,
    [nodeIds],
  );
  return rowCount ?? 0;
}

export async function markActivityUndone(
  db: Queryable,
  id: string,
): Promise<Activity | undefined> {
  const { rows } = await db.query<ActivityRow>(
    `UPDATE activity
     SET undone_at = now(), undo_token = NULL
     WHERE id = $1 AND undone_at IS NULL
     RETURNING ${ACTIVITY_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapActivity(rows[0]) : undefined;
}
