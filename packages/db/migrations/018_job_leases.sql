-- One row per named instance routine. A lease is open or held, never half-held.
-- token_sha256 is the capability; holder_* is who. last_run_* is a separate fact.

CREATE TABLE job_leases (
  name TEXT PRIMARY KEY,
  holder_name TEXT NULL,
  holder_label TEXT NULL,
  token_sha256 TEXT NULL,
  claimed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  last_run_at TIMESTAMPTZ NULL,
  last_run_holder_name TEXT NULL,
  last_run_holder_label TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),

  CONSTRAINT job_leases_name_ck CHECK (name ~ '^[a-z][a-z0-9_-]{0,62}$'),
  CONSTRAINT job_leases_token_sha256_ck CHECK (
    token_sha256 IS NULL OR token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT job_leases_held_shape_ck CHECK (
    (
      holder_name IS NULL
      AND holder_label IS NULL
      AND token_sha256 IS NULL
      AND claimed_at IS NULL
      AND expires_at IS NULL
    )
    OR
    (
      holder_name IS NOT NULL
      AND holder_label IS NOT NULL
      AND token_sha256 IS NOT NULL
      AND claimed_at IS NOT NULL
      AND expires_at IS NOT NULL
    )
  ),
  CONSTRAINT job_leases_last_run_shape_ck CHECK (
    (
      last_run_at IS NULL
      AND last_run_holder_name IS NULL
      AND last_run_holder_label IS NULL
    )
    OR
    (
      last_run_at IS NOT NULL
      AND last_run_holder_name IS NOT NULL
      AND last_run_holder_label IS NOT NULL
    )
  )
);
