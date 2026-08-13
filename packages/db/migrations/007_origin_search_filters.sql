-- Live origin refs are unique so agents can look up Gmail/Calendar/Drive/GitHub
-- identities without twinning people. Foundation stores data.origin.{system,id}
-- only — it does not fetch or mirror those systems' bodies.
-- Search listing (no FTS query) uses type/status/updated_at; child_of uses edges.

CREATE UNIQUE INDEX nodes_origin_live_uidx
  ON nodes (
    (data #>> '{origin,system}'),
    (data #>> '{origin,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{origin,system}', '') <> ''
    AND coalesce(data #>> '{origin,id}', '') <> '';

CREATE INDEX nodes_status_idx
  ON nodes (status)
  WHERE deleted_at IS NULL;

CREATE INDEX nodes_updated_at_idx
  ON nodes (updated_at DESC)
  WHERE deleted_at IS NULL;
