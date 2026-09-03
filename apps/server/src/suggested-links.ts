import {
  getNodeType,
  hasLiveChildOf,
  listNodeTypes,
  listRelationTypes,
  searchTitleLinkCandidates,
  type Queryable,
} from "@foundation/db";
import { classifySuggestedLinks, type Node, type SuggestedLink } from "@foundation/schema";

/** Postgres FTS on the node's title. Never writes an edge or registry row. */
export async function suggestLinksForNode(
  db: Queryable,
  node: Node,
): Promise<SuggestedLink[]> {
  const type = await getNodeType(db, node.type);
  if (!type) {
    return [];
  }
  const [candidates, hasHierarchyParent, nodeTypes, relationTypes] = await Promise.all([
    searchTitleLinkCandidates(db, {
      title: node.title,
      excludeId: node.id,
    }),
    hasLiveChildOf(db, node.id),
    listNodeTypes(db),
    listRelationTypes(db),
  ]);
  return classifySuggestedLinks(node.id, type, candidates, {
    hasHierarchyParent,
    nodeTypes,
    relationTypes,
  });
}
