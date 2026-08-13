import { toolError, type ToolError } from "./mcp-io.js";
import {
  ORIGIN_SYSTEMS,
  type OriginRef,
  type OriginSystem,
} from "./types.js";

export {
  ORIGIN_SYSTEMS,
  OriginRefSchema,
  OriginSystemSchema,
  type OriginRef,
  type OriginSystem,
} from "./types.js";

export const ORIGIN_INCOMPLETE_SUGGESTION =
  "Set data.origin.system to gmail | calendar | drive | github and data.origin.id to that system's stable id. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export const ORIGIN_UNKNOWN_SYSTEM_SUGGESTION =
  "Use gmail, calendar, drive, or github. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export function originConflictError(existingId: string, origin: OriginRef): ToolError {
  return toolError(
    `Origin ${origin.system}:${origin.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with origin to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Read `data.origin` if present. Missing/empty origin is allowed.
 * Incomplete or unknown systems return `{ error, suggestion }`.
 */
export function originFromData(data: Record<string, unknown>): OriginRef | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "origin") || data.origin == null) {
    return undefined;
  }
  const raw = data.origin;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError("data.origin must be an object with system and id", ORIGIN_INCOMPLETE_SUGGESTION);
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  if (systemBlank && idBlank) {
    return undefined;
  }
  if (systemBlank || idBlank) {
    return toolError("data.origin requires system and id", ORIGIN_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("data.origin.system must be a string", ORIGIN_UNKNOWN_SYSTEM_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!ORIGIN_SYSTEMS.includes(system as OriginSystem)) {
    return toolError(`Unknown origin.system "${rec.system.trim()}"`, ORIGIN_UNKNOWN_SYSTEM_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("data.origin.id must be a string", ORIGIN_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("data.origin requires system and id", ORIGIN_INCOMPLETE_SUGGESTION);
  }
  return { system: system as OriginSystem, id };
}

/** Persist the trimmed origin ref so uniqueness and search match lookups. */
export function canonicalizeOriginInData(data: Record<string, unknown>): Record<string, unknown> {
  const origin = originFromData(data);
  if (!origin || isToolErrorOrigin(origin)) {
    return data;
  }
  const raw = data.origin as Record<string, unknown>;
  if (raw.system === origin.system && raw.id === origin.id) {
    return data;
  }
  return { ...data, origin: { ...raw, system: origin.system, id: origin.id } };
}

export function isToolErrorOrigin(value: OriginRef | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
