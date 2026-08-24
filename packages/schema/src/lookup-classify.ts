import { nameCompact, nameNorm } from "./name-norm.js";
import type {
  DuplicatePreflightError,
  DuplicateWarning,
  LookupCandidate,
  LookupInputItem,
  LookupMatch,
  LookupOutcome,
  LookupResult,
} from "./mcp-io.js";
import { DUPLICATE_CANDIDATES_ERROR } from "./mcp-io.js";

export const LOOKUP_SIM_FLOOR = 0.3;
export const LOOKUP_TOKEN_MIN_COMPACT_LEN = 3;
export const LOOKUP_FUZZY_MIN_COMPACT_LEN = 4;
export const LOOKUP_CANDIDATE_DEFAULT = 5;

export const LOOKUP_CANDIDATE_SUGGESTION =
  "Ask the user to confirm which UUID this is before any mutation that depends on the identity (link, upsert, merge, overwrite, or alias write). get is safe for inspection.";

export const LOOKUP_AMBIGUOUS_SUGGESTION =
  "Several live nodes match this name exactly. Ask the user to confirm which UUID to use before any mutation that depends on the identity. get is safe for inspection. Do not merge or upsert a twin.";

export const LOOKUP_NO_MATCH_SUGGESTION =
  "No live candidate above the match floor. Do not upsert a duplicate. Ask if this entity is new, or try search.";

export const LOOKUP_UUID_SUGGESTION =
  "This input is a node UUID. Prefer get when you already have an id.";

export const CREATE_DUPLICATE_SUGGESTION =
  "Exact title or unique exact alias already exists. Do not write a twin. Use a candidate id to get or update, or pass allow_duplicate: true if the user confirms this is a distinct same-name entity.";

export const CREATE_AMBIGUOUS_SUGGESTION =
  "Several live nodes match this title exactly. Ask the user to confirm which UUID to use, or pass allow_duplicate: true if this is a distinct same-name entity. get is safe for inspection. Do not merge.";

export const CREATE_SIMILAR_WARNING =
  "Similar live nodes exist (token, fuzzy, or space-compacted). This write was not blocked. Confirm you are not twinning an existing entity.";

export type LookupRawCandidate = {
  id: string;
  type: string;
  title: string;
  status: LookupCandidate["status"];
  updated_at: string;
  confidence: number;
  match: LookupMatch;
  matched_value: string;
};

const MATCH_RANK: Record<LookupMatch, number> = {
  title_exact: 0,
  alias_exact: 1,
  uuid: 0,
  title_token: 2,
  title_fuzzy: 3,
  alias_fuzzy: 4,
};

function explanationFor(row: LookupRawCandidate, query: string): string {
  if (row.match === "uuid") {
    return "This input is a live node UUID.";
  }
  if (row.match === "title_exact") {
    return "Title match after case, accent, punctuation, and whitespace folding.";
  }
  if (row.match === "alias_exact") {
    return "User-authored alias match after case, accent, punctuation, and whitespace folding.";
  }
  if (row.match === "title_token") {
    return "Token match against a longer title (ranking field, not a probability). Not an exact match.";
  }
  const qNorm = nameNorm(query);
  const qCompact = nameCompact(query);
  const valueNorm = nameNorm(row.matched_value);
  const valueCompact = nameCompact(row.matched_value);
  if (qNorm !== valueNorm && qCompact !== "" && qCompact === valueCompact) {
    return "Names match only after removing spaces (ranking field, not a probability). Not an exact match.";
  }
  if (row.match === "alias_fuzzy") {
    return "Close alias match via trigram similarity (ranking field, not a probability).";
  }
  return "Close title match via trigram similarity (ranking field, not a probability).";
}

function toCandidate(row: LookupRawCandidate, query: string): LookupCandidate {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    updated_at: row.updated_at,
    confidence: row.confidence,
    match: row.match,
    matched_value: row.matched_value,
    explanation: explanationFor(row, query),
  };
}

function sortCandidates(rows: LookupCandidate[]): LookupCandidate[] {
  return [...rows].sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

function uniqueIds(rows: LookupRawCandidate[]): Set<string> {
  return new Set(rows.map((row) => row.id));
}

function pickBestPerNode(rows: LookupRawCandidate[]): LookupRawCandidate[] {
  const best = new Map<string, LookupRawCandidate>();
  for (const row of rows) {
    const current = best.get(row.id);
    if (!current) {
      best.set(row.id, row);
      continue;
    }
    if (MATCH_RANK[row.match] < MATCH_RANK[current.match]) {
      best.set(row.id, row);
      continue;
    }
    if (
      MATCH_RANK[row.match] === MATCH_RANK[current.match] &&
      row.confidence > current.confidence
    ) {
      best.set(row.id, row);
    }
  }
  return [...best.values()];
}

export function classifyLookupResult(
  input: LookupInputItem,
  raw: readonly LookupRawCandidate[],
  limit: number,
): LookupResult {
  const best = pickBestPerNode([...raw]);
  const titleExact = best.filter((row) => row.match === "title_exact" || row.match === "uuid");
  const aliasExact = best.filter((row) => row.match === "alias_exact");
  const exactTierIds = uniqueIds([...titleExact, ...aliasExact]);

  const echo = {
    name: input.name,
    ...(input.type ? { type: input.type } : {}),
    ...(input.id ? { id: input.id } : {}),
  };

  if (exactTierIds.size > 1) {
    const candidates = sortCandidates(
      best
        .filter(
          (row) =>
            exactTierIds.has(row.id) &&
            (row.match === "title_exact" || row.match === "alias_exact" || row.match === "uuid"),
        )
        .map((row) => toCandidate(row, input.name)),
    ).slice(0, limit);
    return {
      input: echo,
      outcome: "ambiguous" satisfies LookupOutcome,
      candidates,
      suggestion: LOOKUP_AMBIGUOUS_SUGGESTION,
    };
  }

  if (exactTierIds.size === 1) {
    const id = [...exactTierIds][0]!;
    const titleHit = titleExact.find((row) => row.id === id);
    const aliasHit = aliasExact.find((row) => row.id === id);
    const chosen = titleHit ?? aliasHit!;
    const outcome: LookupOutcome = titleHit ? "exact" : "alias";
    return {
      input: echo,
      outcome,
      candidates: [toCandidate(chosen, input.name)],
      ...(chosen.match === "uuid" ? { suggestion: LOOKUP_UUID_SUGGESTION } : {}),
    };
  }

  const weak = sortCandidates(
    best
      .filter((row) => row.match === "title_token" || row.match === "title_fuzzy" || row.match === "alias_fuzzy")
      .map((row) => toCandidate(row, input.name)),
  ).slice(0, limit);

  if (weak.length > 0) {
    return {
      input: echo,
      outcome: "candidate",
      candidates: weak,
      suggestion: LOOKUP_CANDIDATE_SUGGESTION,
    };
  }

  return {
    input: echo,
    outcome: "no_match",
    candidates: [],
    suggestion: LOOKUP_NO_MATCH_SUGGESTION,
  };
}

export type CreatePreflightDecision =
  | { action: "block"; error: DuplicatePreflightError }
  | { action: "warn"; warning: DuplicateWarning }
  | { action: "ok" };

/** Exact/alias-tier matches block create. Token/fuzzy/compact warn. Never auto-picks. */
export function createPreflightFromLookup(result: LookupResult): CreatePreflightDecision {
  if (result.outcome === "exact" || result.outcome === "alias" || result.outcome === "ambiguous") {
    return {
      action: "block",
      error: {
        error: DUPLICATE_CANDIDATES_ERROR,
        suggestion:
          result.outcome === "ambiguous" ? CREATE_AMBIGUOUS_SUGGESTION : CREATE_DUPLICATE_SUGGESTION,
        outcome: result.outcome,
        candidates: result.candidates,
      },
    };
  }
  if (result.outcome === "candidate") {
    return {
      action: "warn",
      warning: {
        outcome: "candidate",
        candidates: result.candidates,
        suggestion: CREATE_SIMILAR_WARNING,
      },
    };
  }
  return { action: "ok" };
}
