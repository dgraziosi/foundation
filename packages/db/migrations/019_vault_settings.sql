-- One row. The vault clock and later prune/backup knobs live here.
-- Activity prune does not run in this migration.

CREATE TABLE vault_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  activity_retention_days INTEGER NOT NULL DEFAULT 365,
  backup_retention_days INTEGER NOT NULL DEFAULT 14,
  search_limit_default INTEGER NOT NULL DEFAULT 20,
  list_limit_default INTEGER NOT NULL DEFAULT 200,
  working_set_depth_default INTEGER NOT NULL DEFAULT 1,
  working_set_limit_default INTEGER NOT NULL DEFAULT 40,
  working_set_due_within_days INTEGER NOT NULL DEFAULT 14,
  spine_root_type_slug TEXT NULL,
  spine_root_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),

  CONSTRAINT vault_settings_timezone_ck CHECK (
    timezone ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$'
  ),
  CONSTRAINT vault_settings_activity_retention_ck CHECK (
    activity_retention_days BETWEEN 1 AND 3650
  ),
  CONSTRAINT vault_settings_backup_retention_ck CHECK (
    backup_retention_days BETWEEN 1 AND 3650
  ),
  CONSTRAINT vault_settings_search_limit_ck CHECK (search_limit_default BETWEEN 1 AND 100),
  CONSTRAINT vault_settings_list_limit_ck CHECK (list_limit_default BETWEEN 1 AND 500),
  CONSTRAINT vault_settings_ws_depth_ck CHECK (working_set_depth_default BETWEEN 1 AND 2),
  CONSTRAINT vault_settings_ws_limit_ck CHECK (working_set_limit_default BETWEEN 1 AND 40),
  CONSTRAINT vault_settings_ws_due_ck CHECK (working_set_due_within_days BETWEEN 1 AND 90)
);

INSERT INTO vault_settings (id) VALUES (1);
