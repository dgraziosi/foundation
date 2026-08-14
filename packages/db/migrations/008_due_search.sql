-- Optional data.due (YYYY-MM-DD) on task/goal. Filter in SQL against JSONB,
-- same shape as data.origin — not a new nodes column.
-- Never throw: pre-existing junk (2026-13-01, 2026-02-31) must not fail
-- migrate or search.

CREATE OR REPLACE FUNCTION foundation_iso_date(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF value IS NULL OR value !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
    RETURN NULL;
  END IF;
  IF to_char(to_date(value, 'YYYY-MM-DD'), 'YYYY-MM-DD') = value THEN
    RETURN value;
  END IF;
  RETURN NULL;
EXCEPTION
  WHEN datetime_field_overflow OR invalid_datetime_format OR invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE INDEX nodes_due_idx
  ON nodes (foundation_iso_date(data #>> '{due}'))
  WHERE deleted_at IS NULL
    AND foundation_iso_date(data #>> '{due}') IS NOT NULL;
