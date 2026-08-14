-- Optional data.due (YYYY-MM-DD) on task/goal. Filter in SQL against JSONB,
-- same shape as data.origin — not a new nodes column.

CREATE INDEX nodes_due_idx
  ON nodes ((data #>> '{due}'))
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{due}', '') <> '';
