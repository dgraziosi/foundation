import { toolError, type ToolError } from "./mcp-io.js";
import { REPO_SYSTEMS, type RepoRef, type RepoSystem } from "./types.js";

export {
  REPO_SYSTEMS,
  RepoRefSchema,
  RepoSystemSchema,
  type RepoRef,
  type RepoSystem,
} from "./types.js";

export const REPO_INCOMPLETE_SUGGESTION =
  "Set data.repo.system to github and data.repo.id to that system's stable id. Foundation stores the ref only — do not fetch or mirror the repository body.";

export const REPO_UNKNOWN_SYSTEM_SUGGESTION =
  "Use github. Gmail, Calendar, and Drive are search { url }, not data.repo. Foundation stores the ref only — do not fetch or mirror the repository body.";

export function repoConflictError(existingId: string, repo: RepoRef): ToolError {
  return toolError(
    `Repo ${repo.system}:${repo.id} already belongs to live node ${existingId}`,
    `Call get with ${existingId}. Search with repo to look up before upsert. Do not create a twin.`,
  );
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Read `data.repo` if present. Missing/empty repo is allowed.
 * Incomplete or unknown systems return `{ error, suggestion }`.
 * Does not read leftover `data.code` or `data.origin`.
 */
export function repoFromData(data: Record<string, unknown>): RepoRef | ToolError | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "repo") || data.repo == null) {
    return undefined;
  }
  const raw = data.repo;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return toolError("data.repo must be an object with system and id", REPO_INCOMPLETE_SUGGESTION);
  }
  const rec = raw as Record<string, unknown>;
  const systemBlank = isBlank(rec.system);
  const idBlank = isBlank(rec.id);
  if (systemBlank && idBlank) {
    return undefined;
  }
  if (systemBlank || idBlank) {
    return toolError("data.repo requires system and id", REPO_INCOMPLETE_SUGGESTION);
  }
  if (typeof rec.system !== "string") {
    return toolError("data.repo.system must be a string", REPO_UNKNOWN_SYSTEM_SUGGESTION);
  }
  const system = rec.system.trim();
  if (!REPO_SYSTEMS.includes(system as RepoSystem)) {
    return toolError(`Unknown repo.system "${rec.system.trim()}"`, REPO_UNKNOWN_SYSTEM_SUGGESTION);
  }
  if (typeof rec.id !== "string") {
    return toolError("data.repo.id must be a string", REPO_INCOMPLETE_SUGGESTION);
  }
  const id = rec.id.trim();
  if (!id) {
    return toolError("data.repo requires system and id", REPO_INCOMPLETE_SUGGESTION);
  }
  return { system: system as RepoSystem, id };
}

/** Persist the trimmed repo so uniqueness and search match lookups. */
export function canonicalizeRepoInData(data: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(data, "repo") && data.repo === null) {
    const next = { ...data };
    delete next.repo;
    return next;
  }
  const repo = repoFromData(data);
  if (!repo || isToolErrorRepo(repo)) {
    return data;
  }
  const raw = data.repo as Record<string, unknown>;
  if (raw.system === repo.system && raw.id === repo.id) {
    return data;
  }
  return { ...data, repo: { ...raw, system: repo.system, id: repo.id } };
}

export function isToolErrorRepo(value: RepoRef | ToolError | undefined): value is ToolError {
  return typeof value === "object" && value !== null && "error" in value;
}
