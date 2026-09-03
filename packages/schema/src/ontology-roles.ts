import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import type { NodeType, RelationType } from "./types.js";

export function hierarchyRelations(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): RelationType[] {
  return relations.filter((relation) => relation.kind === "hierarchy");
}

export function hierarchySlugs(relations: readonly RelationType[] = SEED_RELATION_TYPES): string[] {
  return hierarchyRelations(relations).map((relation) => relation.slug);
}

export function isHierarchySlug(
  slug: string,
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): boolean {
  return relations.some((relation) => relation.slug === slug && relation.kind === "hierarchy");
}

export function unconstrainedAssociativeRelations(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): RelationType[] {
  return relations.filter(
    (relation) =>
      relation.kind === "associative" &&
      relation.source_types.length === 0 &&
      relation.target_types.length === 0,
  );
}

export function unconstrainedAssociativeSlugs(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): string[] {
  return unconstrainedAssociativeRelations(relations).map((relation) => relation.slug);
}

export function targetedAssociativeRelations(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): RelationType[] {
  return relations.filter(
    (relation) => relation.kind === "associative" && relation.target_types.length > 0,
  );
}

export function targetedRelationsForType(
  typeSlug: string,
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): RelationType[] {
  return targetedAssociativeRelations(relations).filter((relation) =>
    relation.target_types.includes(typeSlug),
  );
}

/**
 * Title-match suggestions for a targeted associative. Seed `about` qualifies
 * (targets are artifacts). Seed `supports` does not (targets are spine types).
 */
export function suggestionTargetRelations(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
  nodeTypes: readonly NodeType[] = SEED_NODE_TYPES,
): RelationType[] {
  return targetedAssociativeRelations(relations).filter((relation) =>
    relation.target_types.every((slug) => nodeTypes.find((type) => type.slug === slug)?.kind !== "spine"),
  );
}

export function hierarchySlug(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): string | undefined {
  return hierarchyRelations(relations)[0]?.slug;
}

export function genericAssociativeSlug(
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): string | undefined {
  return unconstrainedAssociativeRelations(relations)[0]?.slug;
}

export type HierarchyEdge = {
  from_id: string;
  relation_type: string;
};

export function hasHierarchyParent(
  fromId: string,
  edges: readonly HierarchyEdge[],
  relations: readonly RelationType[] = SEED_RELATION_TYPES,
): boolean {
  const slugs = new Set(hierarchySlugs(relations));
  return edges.some((edge) => edge.from_id === fromId && slugs.has(edge.relation_type));
}
