import type { Payload } from "./types.js";
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
    return toolError(
      "Blob payloads are not implemented yet",
      'Use storage: "inline" with body (text/markdown, text/html, application/json, or text/plain).',
    );
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
