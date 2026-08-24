import { isToolError, toolError, type ToolError } from "./mcp-io.js";

/** Fixture open href. Not a live Drive or Sheet id. */
export const URL_FIXTURE = "https://example.test/drive/file-fixture-1";

export const URL_MAX_LEN = 2048;

export const URL_SUGGESTION =
  "Set data.url to an https URL (no credentials). Pass data.url: null to clear. Omit the key to leave data.url unchanged. Foundation stores the href only — do not fetch or mirror the file body.";

export function patchHasUrl(data: Record<string, unknown> | undefined): boolean {
  return Boolean(data && Object.prototype.hasOwnProperty.call(data, "url"));
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function parseHttpsUrl(trimmed: string): string | ToolError {
  if (trimmed.length > URL_MAX_LEN) {
    return toolError(`data.url must be at most ${URL_MAX_LEN} characters`, URL_SUGGESTION);
  }
  if (/\s/.test(trimmed)) {
    return toolError("data.url must be an https URL", URL_SUGGESTION);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return toolError("data.url must be an https URL", URL_SUGGESTION);
  }
  if (parsed.protocol !== "https:") {
    return toolError("data.url must be https", URL_SUGGESTION);
  }
  if (parsed.username || parsed.password) {
    return toolError("data.url must not include credentials", URL_SUGGESTION);
  }
  if (!parsed.hostname) {
    return toolError("data.url must be an https URL", URL_SUGGESTION);
  }
  return trimmed;
}

/**
 * Read `data.url` if present. Missing/empty url is allowed.
 * Incomplete, non-https, or credentialed values return `{ error, suggestion }`.
 */
export function urlFromData(data: Record<string, unknown>): string | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "url") || data.url == null) {
    return undefined;
  }
  if (typeof data.url !== "string") {
    return toolError("data.url must be an https URL", URL_SUGGESTION);
  }
  if (isBlank(data.url)) {
    return toolError("data.url must be an https URL", URL_SUGGESTION);
  }
  return parseHttpsUrl(data.url.trim());
}

/** Persist the trimmed href so Viewer Open and FTS see the same string. */
export function canonicalizeUrlInData(data: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(data, "url") && data.url === null) {
    const next = { ...data };
    delete next.url;
    return next;
  }
  const url = urlFromData(data);
  if (!url || isToolErrorUrl(url)) {
    return data;
  }
  if (data.url === url) {
    return data;
  }
  return { ...data, url };
}

/**
 * Apply url only when the incoming upsert patch has an own `url` key.
 * Unrelated patches leave legacy (even malformed) url untouched.
 * `data.url: null` clears the href.
 */
export function applyUrlFromPatch(
  merged: Record<string, unknown>,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | ToolError {
  if (!patchHasUrl(patch)) {
    return merged;
  }
  if (patch!.url === null) {
    const next = { ...merged };
    delete next.url;
    return next;
  }
  const parsed = urlFromData({ url: patch!.url });
  if (parsed === undefined) {
    return toolError("data.url must be an https URL", URL_SUGGESTION);
  }
  if (isToolError(parsed)) {
    return parsed;
  }
  return { ...merged, url: parsed };
}

/** Viewer Open: well-formed https only. Malformed legacy values yield undefined. */
export function openableUrlFromData(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) {
    return undefined;
  }
  const parsed = urlFromData(data);
  if (!parsed || isToolErrorUrl(parsed)) {
    return undefined;
  }
  return parsed;
}

export function isToolErrorUrl(value: string | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
