import {
  listEdgesByRelation,
  listEdgesTouching,
  listNodeTypes,
  listRelationTypes,
  type Queryable,
} from "@foundation/db";
import {
  hierarchySlug,
  isHierarchySlug,
  toolError,
  validateExistingLink,
  type RelationType,
  type ToolError,
} from "@foundation/schema";

export type RelationConstraintRetry = "manage_relation" | "undo";

/**
 * Refuse a source_types / target_types (or kind) patch when a live edge
 * would fail validateExistingLink under the next relation properties,
 * or when a hierarchy kind would leave a node with two parents.
 */
export async function refuseInvalidRelationEdges(
  db: Queryable,
  nextRelation: RelationType,
  retry: RelationConstraintRetry,
): Promise<ToolError | null> {
  const edges = await listEdgesByRelation(db, nextRelation.slug);
  if (edges.length === 0) {
    return null;
  }
  const [nodeTypes, relationTypes] = await Promise.all([
    listNodeTypes(db),
    listRelationTypes(db),
  ]);
  const nextRelations = relationTypes.map((relation) =>
    relation.slug === nextRelation.slug ? nextRelation : relation,
  );
  const action = retry === "undo" ? "undo relation update" : "update relation";
  for (const edge of edges) {
    const result = validateExistingLink(
      {
        from_id: edge.from_id,
        to_id: edge.to_id,
        relation_type: edge.relation_type,
        from_type: edge.from_type,
        to_type: edge.to_type,
      },
      { nodeTypes, relationTypes: nextRelations },
    );
    if (!result.ok) {
      return toolError(
        `Cannot ${action} "${nextRelation.slug}": live ${nextRelation.slug} edge would no longer be allowed`,
        `${result.error}. Unlink that ${nextRelation.slug} first (unlink with if-match), then retry ${retry}.`,
      );
    }
  }
  if (nextRelation.kind === "hierarchy") {
    const fromIds = [...new Set(edges.map((edge) => edge.from_id))];
    const touching = await listEdgesTouching(db, fromIds);
    for (const fromId of fromIds) {
      const parents = touching.filter(
        (edge) =>
          edge.from_id === fromId && isHierarchySlug(edge.relation_type, nextRelations),
      );
      if (parents.length > 1) {
        const hierarchy = hierarchySlug(nextRelations) ?? nextRelation.slug;
        return toolError(
          `Cannot ${action} "${nextRelation.slug}": live ${nextRelation.slug} edge would no longer be allowed`,
          `Node already has a ${hierarchy} parent (at most one hierarchy parent). Unlink that ${nextRelation.slug} first (unlink with if-match), then retry ${retry}.`,
        );
      }
    }
  }
  return null;
}
