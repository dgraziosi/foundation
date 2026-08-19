-- Type identity for the read-only window. Hue and glyph live on the type.
ALTER TABLE node_types
  ADD COLUMN hue TEXT NULL,
  ADD COLUMN glyph TEXT NULL;
