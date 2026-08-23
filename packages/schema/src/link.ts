import { toolError, type ToolError } from "./mcp-io.js";
import {
  LINK_SYSTEMS,
  type LinkRef,
  type LinkSystem,
} from "./types.js";

export {
  LINK_SYSTEMS,
  LinkRefSchema,
  LinkSystemSchema,
  type LinkRef,
  type LinkSystem,
} from "./types.js";

export const LINK_INCOMPLETE_SUGGESTION =
  "Set data.link.system to gmail | calendar | drive and data.link.id to that system's stable id. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export const LINK_UNKNOWN_SYSTEM_SUGGESTION =
  "Use gmail, calendar, or drive. GitHub is data.repo, not data.link. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export function linkConflictError(existingId: string, link: LinkRef): ToolError {
  return toolError(
    `Link ${link.system}:${link.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with link to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Read `data.link` if present. Missing/empty link is allowed.
 * Incomplete or unknown systems return `{ error, suggestion }`.
 * Does not read leftover `data.living` or `data.origin`.
 */
export function linkFromData(data: Record<string, unknown>): LinkRef | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "link") || data.link == null) {
    return undefined;
  }
  const raw = data.link;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError("data.link must be an object with system and id", LINK_INCOMPLETE_SUGGESTION);
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  if (systemBlank && idBlank) {
    return undefined;
  }
  if (systemBlank || idBlank) {
    return toolError("data.link requires system and id", LINK_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("data.link.system must be a string", LINK_UNKNOWN_SYSTEM_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!LINK_SYSTEMS.includes(system as LinkSystem)) {
    return toolError(`Unknown link.system "${rec.system.trim()}"`, LINK_UNKNOWN_SYSTEM_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("data.link.id must be a string", LINK_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("data.link requires system and id", LINK_INCOMPLETE_SUGGESTION);
  }
  return { system: system as LinkSystem, id };
}

/** Persist the trimmed link so uniqueness and search match lookups. */
export function canonicalizeLinkInData(data: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(data, "link") && data.link === null) {
    const next = { ...data };
    delete next.link;
    return next;
  }
  const link = linkFromData(data);
  if (!link || isToolErrorLink(link)) {
    return data;
  }
  const raw = data.link as Record<string, unknown>;
  if (raw.system === link.system && raw.id === link.id) {
    return data;
  }
  return { ...data, link: { ...raw, system: link.system, id: link.id } };
}

export function isToolErrorLink(value: LinkRef | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
