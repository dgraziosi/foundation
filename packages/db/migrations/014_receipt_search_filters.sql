-- Live receipt refs are unique so a sent message or cleared event is one
-- current picture. Foundation stores data.receipt.{system,id,kind} only —
-- it does not fetch or mirror Gmail or Calendar bodies. Identity stays on
-- data.origin. Uniqueness is independent of the origin index.

CREATE UNIQUE INDEX nodes_receipt_live_uidx
  ON nodes (
    (data #>> '{receipt,system}'),
    (data #>> '{receipt,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{receipt,system}', '') <> ''
    AND coalesce(data #>> '{receipt,id}', '') <> '';
