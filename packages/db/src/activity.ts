import type { Activity } from "@foundation/schema";
import { randomUUID } from "node:crypto";
import type { Queryable } from "./tx.js";

const UNDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
