-- Slice 8: Postgres FTS on title + extracted inline payload text.
-- HTML tags are stripped; JSON/markdown/plain use the inline body as-is.
-- pgvector remains unused until hybrid search (slice 11).

CREATE OR REPLACE FUNCTION foundation_node_search_text(title text, payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both ' ' FROM coalesce(title, '') || ' ' ||
    CASE
      WHEN coalesce(payload->>'storage', 'inline') <> 'inline' THEN ''
      WHEN payload->>'media_type' = 'text/html' THEN
        trim(both ' ' FROM regexp_replace(
          regexp_replace(coalesce(payload->>'body', ''), '<[^>]+>', ' ', 'g'),
          '\s+', ' ', 'g'
        ))
      ELSE coalesce(payload->>'body', '')
    END)
$$;

ALTER TABLE nodes
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', foundation_node_search_text(title, payload))) STORED;

CREATE INDEX nodes_search_tsv_idx
  ON nodes
  USING GIN (search_tsv)
  WHERE deleted_at IS NULL;
