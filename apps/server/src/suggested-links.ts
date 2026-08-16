import { getNodeType, searchTitleLinkCandidates, type Queryable } from "@foundation/db";
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
  const candidates = await searchTitleLinkCandidates(db, {
    title: node.title,
    excludeId: node.id,
  });
  return classifySuggestedLinks(node.id, type, candidates);
}
