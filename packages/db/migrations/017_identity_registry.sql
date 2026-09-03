-- Leftover living / code / origin / link bags migrate into url / repo.
-- Same unique-index family (nodes_url_live_uidx / nodes_repo_live_uidx).
-- Leftover keys are stripped. No dual-read. No leftover indexes.

CREATE OR REPLACE FUNCTION leftover_identity_ref(bag jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
  SELECT CASE
    WHEN jsonb_typeof(bag) = 'object'
     AND coalesce(btrim(bag ->> 'system'), '') <> ''
     AND coalesce(btrim(bag ->> 'id'), '') <> ''
    THEN jsonb_build_object(
      'system', btrim(bag ->> 'system'),
      'id', btrim(bag ->> 'id')
    )
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION leftover_identity_url(data jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
  SELECT COALESCE(
    CASE WHEN leftover_identity_ref(data -> 'living') ->> 'system' IN ('gmail', 'calendar', 'drive')
         THEN leftover_identity_ref(data -> 'living') END,
    CASE WHEN leftover_identity_ref(data -> 'code') ->> 'system' IN ('gmail', 'calendar', 'drive')
         THEN leftover_identity_ref(data -> 'code') END,
    CASE WHEN leftover_identity_ref(data -> 'origin') ->> 'system' IN ('gmail', 'calendar', 'drive')
         THEN leftover_identity_ref(data -> 'origin') END,
    CASE WHEN leftover_identity_ref(data -> 'link') ->> 'system' IN ('gmail', 'calendar', 'drive')
         THEN leftover_identity_ref(data -> 'link') END
  )
$$;

CREATE OR REPLACE FUNCTION leftover_identity_repo(data jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path FROM CURRENT
AS $$
  SELECT COALESCE(
    CASE WHEN leftover_identity_ref(data -> 'living') ->> 'system' = 'github'
         THEN leftover_identity_ref(data -> 'living') END,
    CASE WHEN leftover_identity_ref(data -> 'code') ->> 'system' = 'github'
         THEN leftover_identity_ref(data -> 'code') END,
    CASE WHEN leftover_identity_ref(data -> 'origin') ->> 'system' = 'github'
         THEN leftover_identity_ref(data -> 'origin') END,
    CASE WHEN leftover_identity_ref(data -> 'link') ->> 'system' = 'github'
         THEN leftover_identity_ref(data -> 'link') END
  )
$$;

CREATE OR REPLACE FUNCTION migrate_leftover_identity()
RETURNS void
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  WITH candidates AS (
    SELECT
      n.id,
      leftover_identity_url(n.data) AS url
    FROM nodes n
    WHERE coalesce(n.metadata #>> '{url,system}', '') = ''
      AND leftover_identity_url(n.data) IS NOT NULL
  ),
  ranked AS (
    SELECT
      id,
      url,
      row_number() OVER (
        PARTITION BY url ->> 'system', url ->> 'id'
        ORDER BY id
      ) AS rn
    FROM candidates
  )
  UPDATE nodes n
  SET metadata = jsonb_set(coalesce(n.metadata, '{}'::jsonb), '{url}', r.url)
  FROM ranked r
  WHERE n.id = r.id
    AND r.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM nodes o
      WHERE o.deleted_at IS NULL
        AND o.id <> n.id
        AND o.metadata #>> '{url,system}' = r.url ->> 'system'
        AND o.metadata #>> '{url,id}' = r.url ->> 'id'
    );

  WITH candidates AS (
    SELECT
      n.id,
      leftover_identity_repo(n.data) AS repo
    FROM nodes n
    WHERE coalesce(n.data #>> '{repo,system}', '') = ''
      AND leftover_identity_repo(n.data) IS NOT NULL
  ),
  ranked AS (
    SELECT
      id,
      repo,
      row_number() OVER (
        PARTITION BY repo ->> 'system', repo ->> 'id'
        ORDER BY id
      ) AS rn
    FROM candidates
  )
  UPDATE nodes n
  SET data = n.data || jsonb_build_object('repo', r.repo)
  FROM ranked r
  WHERE n.id = r.id
    AND r.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM nodes o
      WHERE o.deleted_at IS NULL
        AND o.id <> n.id
        AND o.data #>> '{repo,system}' = r.repo ->> 'system'
        AND o.data #>> '{repo,id}' = r.repo ->> 'id'
    );

  UPDATE nodes
  SET data = data - 'living' - 'code' - 'origin' - 'link'
  WHERE data ?| ARRAY['living', 'code', 'origin', 'link'];
END;
$$;

SELECT migrate_leftover_identity();
