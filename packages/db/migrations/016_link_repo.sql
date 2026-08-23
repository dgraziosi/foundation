-- Url (Gmail/Calendar/Drive) and repo (GitHub) are the live unique keys.
-- Search { url } is { system, id }. That identity is not data.url (https).
-- Persist like leftover living: dedicated unique index + parse + refuse.
-- Hard cut leftover living / code / link indexes.

DROP INDEX IF EXISTS nodes_living_live_uidx;
DROP INDEX IF EXISTS nodes_code_live_uidx;
DROP INDEX IF EXISTS nodes_link_live_uidx;

CREATE UNIQUE INDEX nodes_url_live_uidx
  ON nodes (
    (metadata #>> '{url,system}'),
    (metadata #>> '{url,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(metadata #>> '{url,system}', '') <> ''
    AND coalesce(metadata #>> '{url,id}', '') <> '';

CREATE UNIQUE INDEX nodes_repo_live_uidx
  ON nodes (
    (data #>> '{repo,system}'),
    (data #>> '{repo,id}')
  )
  WHERE deleted_at IS NULL
    AND coalesce(data #>> '{repo,system}', '') <> ''
    AND coalesce(data #>> '{repo,id}', '') <> '';
