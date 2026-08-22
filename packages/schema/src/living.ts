import { toolError, type ToolError } from "./mcp-io.js";
import {
  LIVING_SYSTEMS,
  type LivingRef,
  type LivingSystem,
} from "./types.js";

export {
  LIVING_SYSTEMS,
  LivingRefSchema,
  LivingSystemSchema,
  type LivingRef,
  type LivingSystem,
} from "./types.js";

export const LIVING_INCOMPLETE_SUGGESTION =
  "Set data.living.system to gmail | calendar | drive and data.living.id to that system's stable id. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export const LIVING_UNKNOWN_SYSTEM_SUGGESTION =
  "Use gmail, calendar, or drive. GitHub is data.code, not data.living. Foundation stores the ref only — do not fetch or mirror those systems' bodies.";

export function livingConflictError(existingId: string, living: LivingRef): ToolError {
  return toolError(
    `Living ${living.system}:${living.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with living to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Read `data.living` if present. Missing/empty living is allowed.
 * Incomplete or unknown systems return `{ error, suggestion }`.
 * Does not read `data.origin`.
 */
export function livingFromData(data: Record<string, unknown>): LivingRef | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "living") || data.living == null) {
    return undefined;
  }
  const raw = data.living;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError("data.living must be an object with system and id", LIVING_INCOMPLETE_SUGGESTION);
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  if (systemBlank && idBlank) {
    return undefined;
  }
  if (systemBlank || idBlank) {
    return toolError("data.living requires system and id", LIVING_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("data.living.system must be a string", LIVING_UNKNOWN_SYSTEM_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!LIVING_SYSTEMS.includes(system as LivingSystem)) {
    return toolError(`Unknown living.system "${rec.system.trim()}"`, LIVING_UNKNOWN_SYSTEM_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("data.living.id must be a string", LIVING_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("data.living requires system and id", LIVING_INCOMPLETE_SUGGESTION);
  }
  return { system: system as LivingSystem, id };
}

/** Persist the trimmed living ref so uniqueness and search match lookups. */
export function canonicalizeLivingInData(data: Record<string, unknown>): Record<string, unknown> {
  const living = livingFromData(data);
  if (!living || isToolErrorLiving(living)) {
    return data;
  }
  const raw = data.living as Record<string, unknown>;
  if (raw.system === living.system && raw.id === living.id) {
    return data;
  }
  return { ...data, living: { ...raw, system: living.system, id: living.id } };
}

export function isToolErrorLiving(value: LivingRef | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
