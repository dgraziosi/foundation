-- Snapshot shape version on each activity row.
-- Existing rows default to 1. Prune still uses created_at.

ALTER TABLE activity
  ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE activity
  ADD CONSTRAINT activity_schema_version_ck CHECK (schema_version >= 1);

COMMENT ON COLUMN activity.schema_version IS
  'Activity snapshot shape. 1 is the current before/after object pair.';
