-- Title folding + trigram indexes for lookup.
-- Aliases stay on nodes.data.aliases (JSONB). This migration does not add a
-- JSONB GIN: that operator class does not accelerate trigram similarity over
-- unnested alias strings. Alias matching unnests well-formed arrays in-query.
-- pgvector remains unused.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Must stay aligned with packages/schema nameNorm (unaccent map + Unicode alnum).
CREATE OR REPLACE FUNCTION foundation_name_norm(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT trim(both ' ' FROM regexp_replace(
    lower(foundation_unaccent(coalesce(txt, ''))),
    '[^[:alnum:]]+',
    ' ',
    'g'
  ))
$$;

CREATE OR REPLACE FUNCTION foundation_name_compact(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(foundation_name_norm(txt), ' ', '')
$$;

ALTER TABLE nodes
  ADD COLUMN title_norm text
    GENERATED ALWAYS AS (foundation_name_norm(title)) STORED,
  ADD COLUMN title_compact text
    GENERATED ALWAYS AS (foundation_name_compact(title)) STORED;

CREATE INDEX nodes_title_norm_idx
  ON nodes (title_norm)
  WHERE deleted_at IS NULL;

CREATE INDEX nodes_title_compact_idx
  ON nodes (title_compact)
  WHERE deleted_at IS NULL;

-- Full GIN (not partial): a WHERE deleted_at IS NULL predicate made `%`
-- plans ignore the trigram index and bitmap-scan other live-row indexes.
CREATE INDEX nodes_title_norm_trgm_idx
  ON nodes
  USING GIN (title_norm public.gin_trgm_ops);

CREATE INDEX nodes_title_compact_trgm_idx
  ON nodes
  USING GIN (title_compact public.gin_trgm_ops);
