/** Ingest cap for blob bytes (base64 or uploads). Over cap → tool error. */
export const BLOB_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Max bytes `get` will inline as base64 when `include_body: true`.
 * Larger blobs must be fetched via HTTP GET `/blobs/:id`.
 */
export const BLOB_GET_BODY_MAX_BYTES = 256 * 1024;

/** Zod max for `bytes_base64` so a 20MB file plus padding still parses. */
export const BLOB_BASE64_MAX_CHARS = Math.ceil((BLOB_MAX_BYTES * 4) / 3) + 4096;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function blobRelativePath(id: string): string {
  return `blobs/${id}`;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function hasTraversal(path: string): boolean {
  return (
    path.includes("\0") ||
    path.includes("\\") ||
    path.includes("..") ||
    path.includes("//") ||
    path.startsWith("/") ||
    path.startsWith("~")
  );
}

/**
 * Stored blob paths must be exactly `blobs/<uuid>` relative to FOUNDATION_DATA.
 * Rejects `..`, absolute paths, backslashes, and extra segments.
 */
export function isValidBlobRelativePath(path: string): boolean {
  if (hasTraversal(path)) {
    return false;
  }
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === "blobs" && isUuid(parts[1] ?? "");
}

/**
 * `source_path` is a relative path under FOUNDATION_DATA/uploads.
 * Accepts `file.pdf` or `uploads/file.pdf`. Rejects `..` and absolute paths.
 */
export function isValidUploadSourcePath(sourcePath: string): boolean {
  const trimmed = sourcePath.trim();
  if (!trimmed) {
    return false;
  }
  return !hasTraversal(trimmed);
}
