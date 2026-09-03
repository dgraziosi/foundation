import {
  genericAssociativeSlug,
  hierarchySlug,
  suggestionTargetRelations,
} from "./ontology-roles.js";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import type { NodeType, RelationType } from "./types.js";

/** Seed suggestion verbs. Live suggestions emit the matching relation slug. */
export const SUGGESTED_LINK_KINDS = ["child_of", "about", "relates_to"] as const;
export type SuggestedLinkKind = string;

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
  /** Live hierarchy parent already exists — do not propose a second parent. */
  hasHierarchyParent?: boolean;
  /** @deprecated use hasHierarchyParent */
  hasChildOf?: boolean;
  nodeTypes?: readonly NodeType[];
  relationTypes?: readonly RelationType[];
};

function targetedReason(relationSlug: string, seedAbout: string | undefined): string {
  if (seedAbout && relationSlug === seedAbout) {
    return ABOUT_SUGGESTION_REASON;
  }
  return `Title matches an allowed ${relationSlug} target.`;
}

function relationAllowsSource(relation: RelationType, sourceSlug: string): boolean {
  return relation.source_types.length === 0 || relation.source_types.includes(sourceSlug);
}

/**
 * Ranked title matches in, live-relation suggestions out.
 * Never invents a type or relation. Caller must not write an edge.
 */
export function classifySuggestedLinks(
  sourceId: string,
  sourceType: NodeType,
  candidates: readonly SuggestedLinkCandidate[],
  options: ClassifySuggestedLinksOptions = {},
): SuggestedLink[] {
  const nodeTypes = options.nodeTypes ?? SEED_NODE_TYPES;
  const relationTypes = options.relationTypes ?? SEED_RELATION_TYPES;
  const usable = candidates.filter((candidate) => candidate.id !== sourceId);
  const out: SuggestedLink[] = [];
  const used = new Set<string>();
  const hierarchy = hierarchySlug(relationTypes);
  const generic = genericAssociativeSlug(relationTypes);
  const blockedParent = options.hasHierarchyParent ?? options.hasChildOf ?? false;
  const seedAbout = suggestionTargetRelations(SEED_RELATION_TYPES, SEED_NODE_TYPES)[0]?.slug;

  const take = (
    kind: string,
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

  const hierarchyRelation = hierarchy
    ? relationTypes.find((relation) => relation.slug === hierarchy)
    : undefined;
  if (
    !blockedParent &&
    hierarchyRelation &&
    sourceType.kind === "spine" &&
    sourceType.parent_types.length > 0 &&
    relationAllowsSource(hierarchyRelation, sourceType.slug)
  ) {
    take(
      hierarchyRelation.slug,
      usable.filter((candidate) => sourceType.parent_types.includes(candidate.type)),
      CHILD_OF_SUGGESTION_REASON,
    );
  }

  for (const relation of suggestionTargetRelations(relationTypes, nodeTypes)) {
    if (!relationAllowsSource(relation, sourceType.slug)) {
      continue;
    }
    take(
      relation.slug,
      usable.filter((candidate) => relation.target_types.includes(candidate.type)),
      targetedReason(relation.slug, seedAbout),
    );
  }

  if (out.length === 0 && generic) {
    take(generic, usable, RELATES_TO_SUGGESTION_REASON);
  }

  return out;
}
