import { toolError, type ToolError } from "./mcp-io.js";
import {
  URL_IDENTITY_SYSTEMS,
  type UrlIdentity,
  type UrlIdentitySystem,
} from "./types.js";

export {
  URL_IDENTITY_SYSTEMS,
  UrlIdentitySchema,
  UrlIdentitySystemSchema,
  type UrlIdentity,
  type UrlIdentitySystem,
} from "./types.js";

export const URL_IDENTITY_INCOMPLETE_SUGGESTION =
  "Set url.system to gmail | calendar | drive and url.id to that system's stable id. Pass url on upsert, not data.url. data.url is the https address the Viewer opens. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export const URL_IDENTITY_UNKNOWN_SYSTEM_SUGGESTION =
  "Use gmail, calendar, or drive. GitHub is data.repo, not url. data.url is the https address the Viewer opens. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export function urlIdentityConflictError(existingId: string, url: UrlIdentity): ToolError {
  return toolError(
    `Url ${url.system}:${url.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with url to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Parse a Drive / Gmail / Calendar url `{ system, id }`.
 * Missing/empty is allowed. Incomplete or unknown systems refuse.
 * Does not read leftover living, origin, or link bags. Does not read data.url
 * (that key is the https address).
 */
export function urlIdentityFromValue(raw: unknown): UrlIdentity | ToolError | undefined {
  if (raw == null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError("url must be an object with system and id", URL_IDENTITY_INCOMPLETE_SUGGESTION);
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  if (systemBlank && idBlank) {
    return undefined;
  }
  if (systemBlank || idBlank) {
    return toolError("url requires system and id", URL_IDENTITY_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("url.system must be a string", URL_IDENTITY_UNKNOWN_SYSTEM_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!URL_IDENTITY_SYSTEMS.includes(system as UrlIdentitySystem)) {
    return toolError(`Unknown url.system "${rec.system.trim()}"`, URL_IDENTITY_UNKNOWN_SYSTEM_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("url.id must be a string", URL_IDENTITY_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("url requires system and id", URL_IDENTITY_INCOMPLETE_SUGGESTION);
  }
  return { system: system as UrlIdentitySystem, id };
}

/** Read the unique url from metadata. Leftover data.link / data.living are not this fact. */
export function urlIdentityFromMetadata(
  metadata: Record<string, unknown> | undefined,
): UrlIdentity | ToolError | undefined {
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, "url")) {
    return undefined;
  }
  return urlIdentityFromValue(metadata.url);
}

/**
 * Persist upsert `url` on metadata (dedicated unique index), never on data.url.
 * Client `metadata.url` is ignored so data.url stays the https address.
 * `url: null` clears uniqueness. Omit url to leave the stored identity unchanged.
 */
export function applyUrlIdentityFromUpsert(
  existingMeta: Record<string, unknown> | undefined,
  patchMeta: Record<string, unknown> | undefined,
  url: unknown,
): Record<string, unknown> | ToolError {
  const strippedPatch = { ...(patchMeta ?? {}) };
  delete strippedPatch.url;
  const next = { ...(existingMeta ?? {}), ...strippedPatch };
  if (url === undefined) {
    return next;
  }
  if (url === null) {
    delete next.url;
    return next;
  }
  const parsed = urlIdentityFromValue(url);
  if (parsed === undefined) {
    delete next.url;
    return next;
  }
  if (isToolErrorUrlIdentity(parsed)) {
    return parsed;
  }
  return { ...next, url: { system: parsed.system, id: parsed.id } };
}

export function isToolErrorUrlIdentity(
  value: UrlIdentity | ToolError | undefined,
): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
