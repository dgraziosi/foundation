-- Accent-folding for FTS so ASCII queries match Latin diacritics (fiancee ↔ fiancée).
-- unaccent() is STABLE; generated columns need IMMUTABLE. The two-argument form with
-- an explicit dictionary is the usual wrapper so search_path cannot change the dict.
-- pgvector remains unused.

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION foundation_unaccent(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, txt)
$$;

-- Same unaccent+english_stem pipeline as the wrapper, for ts_headline so
-- fragment selection lines up with folded lexemes while snippets keep diacritics.
DROP TEXT SEARCH CONFIGURATION IF EXISTS foundation_english;
CREATE TEXT SEARCH CONFIGURATION foundation_english (COPY = english);
ALTER TEXT SEARCH CONFIGURATION foundation_english
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, english_stem;

DROP INDEX IF EXISTS nodes_search_tsv_idx;
ALTER TABLE nodes DROP COLUMN IF EXISTS search_tsv;

ALTER TABLE nodes
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', foundation_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('english', foundation_unaccent(foundation_payload_search_text(payload))), 'B') ||
    setweight(to_tsvector('english', foundation_unaccent(foundation_jsonb_search_text(coalesce(data, '{}'::jsonb)))), 'B')
  ) STORED;

CREATE INDEX nodes_search_tsv_idx
  ON nodes
  USING GIN (search_tsv)
  WHERE deleted_at IS NULL;
