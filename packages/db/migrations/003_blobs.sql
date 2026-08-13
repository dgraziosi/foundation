-- Slice 10: blob files under $FOUNDATION_DATA/blobs/<uuid>.
-- Unique sha256 allows content-addressed dedup. Path must be relative blobs/<uuid>.

ALTER TABLE blobs
  ADD CONSTRAINT blobs_sha256_unique UNIQUE (sha256);

ALTER TABLE blobs
  ADD CONSTRAINT blobs_byte_size_nonneg CHECK (byte_size >= 0);

ALTER TABLE blobs
  ADD CONSTRAINT blobs_path_relative CHECK (
    path NOT LIKE '%..%'
    AND path NOT LIKE '/%'
    AND path ~ '^blobs/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );
