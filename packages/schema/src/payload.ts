import type { Payload } from "./types.js";
import {
  BLOB_MAX_BYTES,
  isValidBlobRelativePath,
  isValidUploadSourcePath,
} from "./blobs.js";
import { toolError, type ToolError } from "./mcp-io.js";

/** Inline media types agents should use in v1. Other types are stored as-is. */
export const INLINE_MEDIA_TYPES = [
  "text/markdown",
  "text/html",
  "application/json",
  "text/plain",
] as const;

export type InlineMediaType = (typeof INLINE_MEDIA_TYPES)[number];

export const DEFAULT_PAYLOAD: Payload = {
  media_type: "text/markdown",
  storage: "inline",
  body: "",
};

/** Extract searchable text from an inline payload (REDESIGN §4.8). */
export function extractPayloadText(payload: Payload): string {
  if (payload.storage !== "inline" || payload.body === undefined) {
    return "";
  }
  if (payload.media_type === "text/html") {
    return payload.body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim();
  }
  if (payload.media_type === "application/json") {
    try {
      return JSON.stringify(JSON.parse(payload.body));
    } catch {
      return payload.body;
    }
  }
  return payload.body;
}

export function validateInlinePayload(payload: Payload): ToolError | null {
  if (payload.storage === "blob") {
    return validateStoredBlobPayload(payload);
  }
  if (payload.body === undefined) {
    return toolError("inline payload requires body", 'Pass payload.body as a string.');
  }
  if (payload.media_type === "application/json") {
    try {
      JSON.parse(payload.body);
    } catch {
      return toolError(
        "application/json payload body must be valid JSON",
        "Pass a JSON string in payload.body, e.g. \"{\\\"ok\\\":true}\".",
      );
    }
  }
  return null;
}

export function validateStoredBlobPayload(payload: Payload): ToolError | null {
  if (payload.storage !== "blob") {
    return null;
  }
  if (!payload.blob_id) {
    return toolError(
      "blob payload requires blob_id",
      "Ingest with payload.bytes_base64 or payload.source_path, or pass an existing blob_id.",
    );
  }
  return null;
}

export function validateBlobRelativePath(path: string): ToolError | null {
  if (isValidBlobRelativePath(path)) {
    return null;
  }
  return toolError(
    path.includes("..") || path.startsWith("/") || path.startsWith("~")
      ? "Blob path traversal is not allowed"
      : "Invalid blob path",
    'Path must be exactly blobs/<uuid> relative to FOUNDATION_DATA, with no ".." or absolute segments.',
  );
}

export function validateUploadSourcePath(sourcePath: string): ToolError | null {
  if (isValidUploadSourcePath(sourcePath)) {
    return null;
  }
  if (!sourcePath.trim()) {
    return toolError(
      "source_path is empty",
      "Pass a relative filename under FOUNDATION_DATA/uploads.",
    );
  }
  return toolError(
    "source_path traversal is not allowed",
    'Pass a relative path under FOUNDATION_DATA/uploads (no "..", no absolute path).',
  );
}

export function formatBlobSizeCapError(maxBytes: number = BLOB_MAX_BYTES): ToolError {
  const mb = Math.round(maxBytes / (1024 * 1024));
  const label = mb >= 1 ? `${mb}MB` : `${maxBytes} bytes`;
  return toolError(
    `Blob exceeds size cap of ${maxBytes} bytes (${label})`,
    `Keep the file at or under ${label}, or store a smaller derivative. Large canonical files live under FOUNDATION_DATA/blobs, not in git or inline payload body.`,
  );
}

/** Stored node payload for a blob: metadata only, never the bytes. */
export function storedBlobPayload(mediaType: string, blobId: string): Payload {
  return {
    media_type: mediaType,
    storage: "blob",
    blob_id: blobId,
  };
}
