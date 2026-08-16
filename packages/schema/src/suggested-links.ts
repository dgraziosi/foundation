import type { NodeType } from "./types.js";

export const SUGGESTED_LINK_KINDS = ["child_of", "about", "relates_to"] as const;
export type SuggestedLinkKind = (typeof SUGGESTED_LINK_KINDS)[number];

export const SUGGESTED_LINKS_CAP = 5;

export const CHILD_OF_SUGGESTION_REASON = "Title matches an allowed parent.";
export const ABOUT_SUGGESTION_REASON = "Title looks like a person already in the graph.";
export const RELATES_TO_SUGGESTION_REASON = "Close title match.";

export type SuggestedLinkTarget = {
  id: string;
  type: string;
  title: string;
};

export type SuggestedLink = {
  kind: SuggestedLinkKind;
  target: SuggestedLinkTarget;
  reason: string;
};

export type SuggestedLinkCandidate = SuggestedLinkTarget;

export type ClassifySuggestedLinksOptions = {
  /** Live child_of already exists — do not propose a second parent. */
  hasChildOf?: boolean;
};

/**
 * Ranked title matches in, seed-relation suggestions out.
 * Never invents a type or relation. Caller must not write an edge.
 */
export function classifySuggestedLinks(
  sourceId: string,
  sourceType: NodeType,
  candidates: readonly SuggestedLinkCandidate[],
  options: ClassifySuggestedLinksOptions = {},
): SuggestedLink[] {
  const usable = candidates.filter((candidate) => candidate.id !== sourceId);
  const out: SuggestedLink[] = [];
  const used = new Set<string>();

  const take = (
    kind: SuggestedLinkKind,
    items: readonly SuggestedLinkCandidate[],
    reason: string,
  ): void => {
    for (const item of items) {
      if (out.length >= SUGGESTED_LINKS_CAP) {
        return;
      }
      if (used.has(item.id)) {
        continue;
      }
      used.add(item.id);
      out.push({
        kind,
        target: { id: item.id, type: item.type, title: item.title },
        reason,
      });
    }
  };

  if (
    !options.hasChildOf &&
    sourceType.kind === "spine" &&
    sourceType.parent_types.length > 0
  ) {
    take(
      "child_of",
      usable.filter((candidate) => sourceType.parent_types.includes(candidate.type)),
      CHILD_OF_SUGGESTION_REASON,
    );
  }

  take(
    "about",
    usable.filter((candidate) => candidate.type === "person"),
    ABOUT_SUGGESTION_REASON,
  );

  if (out.length === 0) {
    take("relates_to", usable, RELATES_TO_SUGGESTION_REASON);
  }

  return out;
}
