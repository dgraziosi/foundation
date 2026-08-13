-- Search quality: FTS on title + extracted payload body + nodes.data.
-- Do not index the payload wrapper (media_type / storage / blob_id).
-- HTML: visible text plus alt/title/aria-label/placeholder attribute values.
-- JSON: string/number/boolean values from the parsed body, not JSON.stringify of the wrapper.
-- pgvector remains unused.

CREATE OR REPLACE FUNCTION foundation_jsonb_search_text(doc jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(string_agg(txt, ' '), '')
  FROM (
    SELECT
      CASE jsonb_typeof(value)
        WHEN 'string' THEN trim(both '"' from value::text)
        WHEN 'number' THEN value::text
        WHEN 'boolean' THEN value::text
        ELSE NULL
      END AS txt
    FROM jsonb_path_query(coalesce(doc, '{}'::jsonb), 'strict $.**') AS value
  ) extracted
  WHERE txt IS NOT NULL AND txt <> ''
$$;

CREATE OR REPLACE FUNCTION foundation_html_search_text(html text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both ' ' FROM regexp_replace(
    coalesce(
      (
        SELECT string_agg(m[2], ' ')
        FROM regexp_matches(
          coalesce(html, ''),
          '(alt|title|aria-label|aria-description|placeholder)\s*=\s*["'']([^"'']*)["'']',
          'gi'
        ) AS m
      ),
      ''
    )
    || ' ' ||
    regexp_replace(
      regexp_replace(
        coalesce(html, ''),
        '<(script|style)[^>]*>.*</\1>',
        ' ',
        'gi'
      ),
      '<[^>]+>',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  ))
$$;

CREATE OR REPLACE FUNCTION foundation_payload_search_text(payload jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  body text;
BEGIN
  IF coalesce(payload->>'storage', 'inline') <> 'inline' THEN
    RETURN '';
  END IF;
  body := coalesce(payload->>'body', '');
  IF payload->>'media_type' = 'text/html' THEN
    RETURN foundation_html_search_text(body);
  END IF;
  IF payload->>'media_type' = 'application/json' THEN
    BEGIN
      RETURN foundation_jsonb_search_text(body::jsonb);
    EXCEPTION
      WHEN others THEN
        RETURN body;
    END;
  END IF;
  RETURN body;
END;
$$;

DROP INDEX IF EXISTS nodes_search_tsv_idx;
ALTER TABLE nodes DROP COLUMN IF EXISTS search_tsv;

DROP FUNCTION IF EXISTS foundation_node_search_text(text, jsonb);

CREATE OR REPLACE FUNCTION foundation_node_search_text(title text, payload jsonb, data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both ' ' FROM coalesce(title, '') || ' ' ||
    foundation_payload_search_text(payload) || ' ' ||
    foundation_jsonb_search_text(coalesce(data, '{}'::jsonb)))
$$;

ALTER TABLE nodes
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', foundation_payload_search_text(payload)), 'B') ||
    setweight(to_tsvector('english', foundation_jsonb_search_text(coalesce(data, '{}'::jsonb))), 'B')
  ) STORED;

CREATE INDEX nodes_search_tsv_idx
  ON nodes
  USING GIN (search_tsv)
  WHERE deleted_at IS NULL;
