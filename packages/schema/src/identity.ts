import { isToolErrorRepo, repoFromData } from "./repo.js";
import { REPO_SYSTEMS, URL_IDENTITY_SYSTEMS, type RepoSystem, type UrlIdentitySystem } from "./types.js";
import { isToolErrorUrlIdentity, urlIdentityFromMetadata } from "./url-identity.js";

/** Retired data bags that once held `{ system, id }`. They are not vault keys. */
export const RETIRED_IDENTITY_DATA_KEYS = ["living", "code", "origin", "link"] as const;
export type RetiredIdentityDataKey = (typeof RETIRED_IDENTITY_DATA_KEYS)[number];

const LEFTOVER_READ_ORDER = RETIRED_IDENTITY_DATA_KEYS;

export function hasLeftoverIdentityKeys(data: Record<string, unknown> | undefined): boolean {
  if (!data) {
    return false;
  }
  return RETIRED_IDENTITY_DATA_KEYS.some((key) => Object.prototype.hasOwnProperty.call(data, key));
}

function leftoverRefFromValue(raw: unknown): { system: string; id: string } | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.system !== "string" || typeof rec.id !== "string") {
    return undefined;
  }
  const system = rec.system.trim();
  const id = rec.id.trim();
  if (!system || !id) {
    return undefined;
  }
  return { system, id };
}

function classifyLeftoverSystem(system: string): "url" | "repo" | undefined {
  if ((URL_IDENTITY_SYSTEMS as readonly string[]).includes(system)) {
    return "url";
  }
  if ((REPO_SYSTEMS as readonly string[]).includes(system)) {
    return "repo";
  }
  return undefined;
}

/**
 * Map leftover identity bags into url / repo, then strip the leftover keys.
 * Current url and repo win. Incomplete or unknown leftover bags are dropped.
 * Does not read leftover keys as search selectors.
 */
export function migrateLeftoverIdentity(
  data: Record<string, unknown>,
  metadata: Record<string, unknown>,
): { data: Record<string, unknown>; metadata: Record<string, unknown> } {
  let urlFill: { system: UrlIdentitySystem; id: string } | undefined;
  let repoFill: { system: RepoSystem; id: string } | undefined;
  for (const key of LEFTOVER_READ_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    const ref = leftoverRefFromValue(data[key]);
    if (!ref) {
      continue;
    }
    const bag = classifyLeftoverSystem(ref.system);
    if (bag === "url" && !urlFill) {
      urlFill = { system: ref.system as UrlIdentitySystem, id: ref.id };
    }
    if (bag === "repo" && !repoFill) {
      repoFill = { system: ref.system as RepoSystem, id: ref.id };
    }
  }

  const nextData = { ...data };
  for (const key of RETIRED_IDENTITY_DATA_KEYS) {
    delete nextData[key];
  }

  const nextMeta = { ...metadata };
  const existingUrl = urlIdentityFromMetadata(nextMeta);
  if (urlFill && (existingUrl === undefined || isToolErrorUrlIdentity(existingUrl))) {
    nextMeta.url = { system: urlFill.system, id: urlFill.id };
  }

  const existingRepo = repoFromData(nextData);
  if (repoFill && (existingRepo === undefined || isToolErrorRepo(existingRepo))) {
    nextData.repo = { system: repoFill.system, id: repoFill.id };
  }

  return { data: nextData, metadata: nextMeta };
}
