import { DUE_TIMEZONE, todayInTimeZone } from "./due.js";
import {
  WORKING_SET_DEPTH_DEFAULT,
  WORKING_SET_DUE_WITHIN_DAYS_DEFAULT,
  WORKING_SET_LIMIT_DEFAULT,
} from "./working-set.js";

export const VAULT_SETTINGS_ID = 1;
export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 100;
export const LIST_LIMIT_DEFAULT = 200;
export const LIST_LIMIT_MAX = 500;
export const ACTIVITY_RETENTION_DAYS_DEFAULT = 365;
export const BACKUP_RETENTION_DAYS_DEFAULT = 14;
export const RETENTION_DAYS_MAX = 3650;

export type VaultSettings = {
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

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  timezone: DUE_TIMEZONE,
  activity_retention_days: ACTIVITY_RETENTION_DAYS_DEFAULT,
  backup_retention_days: BACKUP_RETENTION_DAYS_DEFAULT,
  search_limit_default: SEARCH_LIMIT_DEFAULT,
  list_limit_default: LIST_LIMIT_DEFAULT,
  working_set_depth_default: WORKING_SET_DEPTH_DEFAULT,
  working_set_limit_default: WORKING_SET_LIMIT_DEFAULT,
  working_set_due_within_days: WORKING_SET_DUE_WITHIN_DAYS_DEFAULT,
  spine_root_type_slug: null,
  spine_root_id: null,
};

export function isIanaTimeZone(value: string): boolean {
  if (!value) {
    return false;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function resolveVaultTimeZone(value: string): string {
  return isIanaTimeZone(value) ? value : DUE_TIMEZONE;
}

export function todayInVault(timezone: string, now = new Date()): string {
  return todayInTimeZone(resolveVaultTimeZone(timezone), now);
}
