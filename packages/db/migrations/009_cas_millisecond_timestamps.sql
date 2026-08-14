-- get() emits Date.toISOString() (millisecond). SQL if-match must agree with
-- timestampsEqual (Date.parse), not EXTRACT(EPOCH)*1000::bigint (float rounding
-- plus leftover microseconds from now() on insert). Existing vaults may still
-- store sub-millisecond updated_at; truncate so those rows stay updatable.

ALTER TABLE nodes
  ALTER COLUMN created_at SET DEFAULT date_trunc('milliseconds', now()),
  ALTER COLUMN updated_at SET DEFAULT date_trunc('milliseconds', now());

UPDATE nodes
  SET created_at = date_trunc('milliseconds', created_at),
      updated_at = date_trunc('milliseconds', updated_at)
  WHERE created_at <> date_trunc('milliseconds', created_at)
     OR updated_at <> date_trunc('milliseconds', updated_at);
