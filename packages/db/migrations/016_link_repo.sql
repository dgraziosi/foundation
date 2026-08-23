-- Link (Gmail/Calendar/Drive) and repo (GitHub) are the live unique keys.
-- Hard cut: drop leftover living/code indexes. There is no data.living
-- or data.code contract.

DROP INDEX IF EXISTS nodes_living_live_uidx;
DROP INDEX IF EXISTS nodes_code_live_uidx;

CREATE UNIQUE INDEX nodes_link_live_uidx
  ON nodes (
    (data #>> '{link,system}'),
    (data #>> '{link,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{link,system}', '') <> ''
    AND coalesce(data #>> '{link,id}', '') <> '';

CREATE UNIQUE INDEX nodes_repo_live_uidx
  ON nodes (
    (data #>> '{repo,system}'),
    (data #>> '{repo,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{repo,system}', '') <> ''
    AND coalesce(data #>> '{repo,id}', '') <> '';
