-- Foundation graph: UUID nodes, typed jsonb payloads, edges as source of truth.
-- pgvector is enabled for a later search slice; unused here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE node_types (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('spine', 'artifact')),
  parent_types TEXT[] NOT NULL DEFAULT '{}',
  json_schema JSONB NULL,
  is_system BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE relation_types (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('hierarchy', 'associative')),
  source_types TEXT[] NOT NULL DEFAULT '{}',
  target_types TEXT[] NOT NULL DEFAULT '{}',
  is_symmetric BOOLEAN NOT NULL DEFAULT false,
  semantic_parent_slug TEXT NULL REFERENCES relation_types (slug),
  is_system BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL REFERENCES node_types (slug),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  payload JSONB NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX nodes_type_idx ON nodes (type) WHERE deleted_at IS NULL;
CREATE INDEX nodes_title_idx ON nodes (title) WHERE deleted_at IS NULL;

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id UUID NOT NULL REFERENCES nodes (id),
  to_id UUID NOT NULL REFERENCES nodes (id),
  relation_type TEXT NOT NULL REFERENCES relation_types (slug),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_id, to_id, relation_type)
);

CREATE UNIQUE INDEX edges_one_child_of_per_source
  ON edges (from_id)
  WHERE relation_type = 'child_of';

CREATE INDEX edges_from_idx ON edges (from_id);
CREATE INDEX edges_to_idx ON edges (to_id);
CREATE INDEX edges_relation_idx ON edges (relation_type);

CREATE TABLE activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL CHECK (actor IN ('agent', 'user', 'system')),
  actor_label TEXT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'create', 'update', 'delete', 'restore',
    'link', 'unlink', 'type_change', 'relation_change'
  )),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('node', 'edge', 'type', 'relation')),
  target_id TEXT NULL,
  before JSONB NULL,
  after JSONB NULL,
  reversible BOOLEAN NOT NULL,
  undo_token UUID NULL,
  token_expires_at TIMESTAMPTZ NULL,
  undone_at TIMESTAMPTZ NULL,
  rationale TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_created_idx ON activity (created_at DESC);
CREATE INDEX activity_target_idx ON activity (target_id);

-- Slice 9/10 will use this; stub so later migrations are additive, not a rewrite.
CREATE TABLE blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type TEXT NOT NULL,
  byte_size INT NOT NULL,
  sha256 TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
