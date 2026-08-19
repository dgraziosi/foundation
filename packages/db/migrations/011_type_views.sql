-- Type-declared view engine. Viewer reads these; it does not infer or store a picker.
ALTER TABLE node_types
  ADD COLUMN views TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN default_view TEXT NULL;
