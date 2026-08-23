import { toolError, type ToolError } from "./mcp-io.js";
import { CODE_SYSTEMS, type CodeRef, type CodeSystem } from "./types.js";

export {
  CODE_SYSTEMS,
  CodeRefSchema,
  CodeSystemSchema,
  type CodeRef,
  type CodeSystem,
} from "./types.js";

export const CODE_INCOMPLETE_SUGGESTION =
  "Set data.code.system to github and data.code.id to that system's stable id. Foundation stores the ref only — do not fetch or mirror the repository body.";

export const CODE_UNKNOWN_SYSTEM_SUGGESTION =
  "Use github. Gmail, Calendar, and Drive are data.living, not data.code. Foundation stores the ref only — do not fetch or mirror the repository body.";

export function codeConflictError(existingId: string, code: CodeRef): ToolError {
  return toolError(
    `Code ${code.system}:${code.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with code to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Read `data.code` if present. Missing/empty code is allowed.
 * Incomplete or unknown systems return `{ error, suggestion }`.
 * Does not read `data.origin`.
 */
export function codeFromData(data: Record<string, unknown>): CodeRef | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "code") || data.code == null) {
    return undefined;
  }
  const raw = data.code;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError("data.code must be an object with system and id", CODE_INCOMPLETE_SUGGESTION);
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  if (systemBlank && idBlank) {
    return undefined;
  }
  if (systemBlank || idBlank) {
    return toolError("data.code requires system and id", CODE_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("data.code.system must be a string", CODE_UNKNOWN_SYSTEM_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!CODE_SYSTEMS.includes(system as CodeSystem)) {
    return toolError(`Unknown code.system "${rec.system.trim()}"`, CODE_UNKNOWN_SYSTEM_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("data.code.id must be a string", CODE_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("data.code requires system and id", CODE_INCOMPLETE_SUGGESTION);
  }
  return { system: system as CodeSystem, id };
}

/** Persist the trimmed code ref so uniqueness and search match lookups. */
export function canonicalizeCodeInData(data: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(data, "code") && data.code === null) {
    const next = { ...data };
    delete next.code;
    return next;
  }
  const code = codeFromData(data);
  if (!code || isToolErrorCode(code)) {
    return data;
  }
  const raw = data.code as Record<string, unknown>;
  if (raw.system === code.system && raw.id === code.id) {
    return data;
  }
  return { ...data, code: { ...raw, system: code.system, id: code.id } };
}

export function isToolErrorCode(value: CodeRef | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
