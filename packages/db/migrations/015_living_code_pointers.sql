-- Living (Gmail/Calendar/Drive) and code (GitHub) are distinct pointer
-- shapes. Unique on live nodes, independent of each other and of receipt.
-- Hard cut: drop the old identity index. There is no data.origin contract.

DROP INDEX IF EXISTS nodes_origin_live_uidx;

CREATE UNIQUE INDEX nodes_living_live_uidx
  ON nodes (
    (data #>> '{living,system}'),
    (data #>> '{living,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{living,system}', '') <> ''
    AND coalesce(data #>> '{living,id}', '') <> '';

CREATE UNIQUE INDEX nodes_code_live_uidx
  ON nodes (
    (data #>> '{code,system}'),
    (data #>> '{code,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{code,system}', '') <> ''
    AND coalesce(data #>> '{code,id}', '') <> '';
