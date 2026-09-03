import {
  DEFAULT_VAULT_SETTINGS,
  VAULT_SETTINGS_ID,
  resolveVaultTimeZone,
  type VaultSettings,
} from "@foundation/schema";
import type { Queryable } from "./tx.js";

type SettingsSqlRow = {
  timezone: string;
  activity_retention_days: number;
  backup_retention_days: number;
  search_limit_default: number;
  list_limit_default: number;
  working_set_depth_default: number;
  working_set_limit_default: number;
  working_set_due_within_days: number;
  spine_root_type_slug: string | null;
  spine_root_id: string | null;
};

export type VaultSettingsPatch = Partial<VaultSettings>;

export function mapVaultSettings(row: SettingsSqlRow): VaultSettings {
  return {
    timezone: resolveVaultTimeZone(row.timezone),
    activity_retention_days: row.activity_retention_days,
    backup_retention_days: row.backup_retention_days,
    search_limit_default: row.search_limit_default,
    list_limit_default: row.list_limit_default,
    working_set_depth_default: row.working_set_depth_default,
    working_set_limit_default: row.working_set_limit_default,
    working_set_due_within_days: row.working_set_due_within_days,
    spine_root_type_slug: row.spine_root_type_slug,
    spine_root_id: row.spine_root_id,
  };
}

export async function getVaultSettings(db: Queryable): Promise<VaultSettings> {
  const { rows } = await db.query<SettingsSqlRow>(
    `SELECT timezone, activity_retention_days, backup_retention_days,
            search_limit_default, list_limit_default,
            working_set_depth_default, working_set_limit_default, working_set_due_within_days,
            spine_root_type_slug, spine_root_id
       FROM vault_settings
      WHERE id = $1`,
    [VAULT_SETTINGS_ID],
  );
  return rows[0] ? mapVaultSettings(rows[0]) : { ...DEFAULT_VAULT_SETTINGS };
}

export async function updateVaultSettings(
  db: Queryable,
  patch: VaultSettingsPatch,
): Promise<VaultSettings> {
  const current = await getVaultSettings(db);
  const next: VaultSettings = {
    ...current,
    ...patch,
    timezone: resolveVaultTimeZone(patch.timezone ?? current.timezone),
  };
  const { rows } = await db.query<SettingsSqlRow>(
    `UPDATE vault_settings
        SET timezone = $2,
            activity_retention_days = $3,
            backup_retention_days = $4,
            search_limit_default = $5,
            list_limit_default = $6,
            working_set_depth_default = $7,
            working_set_limit_default = $8,
            working_set_due_within_days = $9,
            spine_root_type_slug = $10,
            spine_root_id = $11,
            updated_at = date_trunc('milliseconds', clock_timestamp())
      WHERE id = $1
      RETURNING timezone, activity_retention_days, backup_retention_days,
                search_limit_default, list_limit_default,
                working_set_depth_default, working_set_limit_default, working_set_due_within_days,
                spine_root_type_slug, spine_root_id`,
    [
      VAULT_SETTINGS_ID,
      next.timezone,
      next.activity_retention_days,
      next.backup_retention_days,
      next.search_limit_default,
      next.list_limit_default,
      next.working_set_depth_default,
      next.working_set_limit_default,
      next.working_set_due_within_days,
      next.spine_root_type_slug,
      next.spine_root_id,
    ],
  );
  return rows[0] ? mapVaultSettings(rows[0]) : next;
}
