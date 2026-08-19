-- Field template and view declarations (filter / sort / group) on the type.
ALTER TABLE node_types
  ADD COLUMN fields JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE node_types
  ADD COLUMN views_decl JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE node_types
SET views_decl = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('id', view_id))
  FROM unnest(views) AS view_id
), '[]'::jsonb);

ALTER TABLE node_types
  DROP COLUMN views;

ALTER TABLE node_types
  RENAME COLUMN views_decl TO views;

ALTER TABLE node_types
  ALTER COLUMN views SET DEFAULT '[]'::jsonb;
