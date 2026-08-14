-- Optional data.due (YYYY-MM-DD) on task/goal. Filter in SQL against JSONB,
-- same shape as data.origin — not a new nodes column.
-- Only real calendar dates match (2026-02-31 is not a due).

CREATE OR REPLACE FUNCTION foundation_iso_date(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND to_char(to_date(value, 'YYYY-MM-DD'), 'YYYY-MM-DD') = value
    THEN value
    ELSE NULL
  END
$$;

CREATE INDEX nodes_due_idx
  ON nodes (foundation_iso_date(data #>> '{due}'))
  WHERE deleted_at IS NULL
    AND foundation_iso_date(data #>> '{due}') IS NOT NULL;
