-- Multi-writer safety: create idempotency so a retried create does not twin a node.
-- If-match uses nodes.updated_at (no write-ACL). Activity already has actor / actor_label.

ALTER TABLE nodes ADD COLUMN idempotency_key TEXT NULL;

CREATE UNIQUE INDEX nodes_idempotency_key_uidx
  ON nodes (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
