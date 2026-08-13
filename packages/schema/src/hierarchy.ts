import { SEED_NODE_TYPES } from "./seeds.js";
import type { NodeType } from "./types.js";

export function getNodeType(
  slug: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): NodeType | undefined {
  return types.find((type) => type.slug === slug);
}

export function getParentTypes(
  slug: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): string[] {
  return getNodeType(slug, types)?.parent_types ?? [];
}

/** Single parent type when the type has exactly one allowed parent. */
export function getParentType(
  slug: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): string | undefined {
  const parents = getParentTypes(slug, types);
  return parents.length === 1 ? parents[0] : undefined;
}

export function requiresHierarchyParent(
  slug: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): boolean {
  return getParentTypes(slug, types).length > 0;
}

export function canChildOf(
  sourceType: string,
  targetType: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): boolean {
  return getParentTypes(sourceType, types).includes(targetType);
}

export function isSpineType(
  slug: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): boolean {
  return getNodeType(slug, types)?.kind === "spine";
}

export function isArtifactType(
  slug: string,
  types: readonly NodeType[] = SEED_NODE_TYPES,
): boolean {
  return getNodeType(slug, types)?.kind === "artifact";
}
