import { getVaultSettings } from "./settings.js";
import { iso, type Queryable } from "./tx.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PruneActivityResult = {
  deleted: number;
  cutoff: string;
  activity_retention_days: number;
};

export function activityRetentionCutoff(now: Date, activityRetentionDays: number): Date {
  return new Date(now.getTime() - activityRetentionDays * MS_PER_DAY);
}

/** Delete activity older than vault_settings.activity_retention_days. Idempotent. */
export async function pruneActivity(
  db: Queryable,
  options: { now?: Date } = {},
): Promise<PruneActivityResult> {
  const settings = await getVaultSettings(db);
  const now = options.now ?? new Date();
  const cutoff = activityRetentionCutoff(now, settings.activity_retention_days);
  const { rowCount } = await db.query(`DELETE FROM activity WHERE created_at < $1`, [cutoff]);
  return {
    deleted: rowCount ?? 0,
    cutoff: iso(cutoff),
    activity_retention_days: settings.activity_retention_days,
  };
}
