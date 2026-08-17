import { isToolError, toolError, type ToolError } from "./mcp-io.js";
import { nameNorm } from "./name-norm.js";

export const ALIASES_MAX = 20;
export const ALIAS_MAX_LEN = 120;

export const ALIASES_SUGGESTION =
  "data.aliases must be an array of strings (max 20). Each entry is 1–120 characters after trim. Pass aliases: [] to clear. Omit the key to leave aliases unchanged.";

export function patchHasAliases(data: Record<string, unknown> | undefined): boolean {
  return Boolean(data && Object.prototype.hasOwnProperty.call(data, "aliases"));
}

/**
 * Validate and canonicalize an explicit aliases patch.
 * Empty array is valid and clears. Non-arrays and non-strings refuse.
 */
export function canonicalizeAliasesPatch(aliases: unknown): string[] | ToolError {
  if (!Array.isArray(aliases)) {
    return toolError("data.aliases must be an array of strings", ALIASES_SUGGESTION);
  }
  if (aliases.length > ALIASES_MAX) {
    return toolError(
      `data.aliases accepts at most ${ALIASES_MAX} entries`,
      ALIASES_SUGGESTION,
    );
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of aliases) {
    if (typeof item !== "string") {
      return toolError("data.aliases must be an array of strings", ALIASES_SUGGESTION);
    }
    const trimmed = item.trim();
    if (!trimmed) {
      return toolError("data.aliases entries must be non-empty strings", ALIASES_SUGGESTION);
    }
    if (trimmed.length > ALIAS_MAX_LEN) {
      return toolError(
        `data.aliases entries must be at most ${ALIAS_MAX_LEN} characters`,
        ALIASES_SUGGESTION,
      );
    }
    const norm = nameNorm(trimmed);
    if (!norm || seen.has(norm)) {
      continue;
    }
    seen.add(norm);
    out.push(trimmed);
  }
  return out;
}

/**
 * Apply aliases only when the incoming upsert patch has an own `aliases` key.
 * Unrelated patches leave legacy (even malformed) aliases untouched.
 */
export function applyAliasesFromPatch(
  merged: Record<string, unknown>,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | ToolError {
  if (!patchHasAliases(patch)) {
    return merged;
  }
  const canonical = canonicalizeAliasesPatch(patch!.aliases);
  if (isToolError(canonical)) {
    return canonical;
  }
  return { ...merged, aliases: canonical };
}

/**
 * Read well-formed alias strings for lookup. Malformed legacy values yield [].
 * Mixed arrays keep only non-empty strings.
 */
export function wellFormedAliasStrings(data: Record<string, unknown> | undefined): string[] {
  const raw = data?.aliases;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed) {
      out.push(trimmed);
    }
  }
  return out;
}
