import {
  getNodeType,
  hasLiveChildOf,
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
  const [candidates, hasChildOf] = await Promise.all([
    searchTitleLinkCandidates(db, {
      title: node.title,
      excludeId: node.id,
    }),
    hasLiveChildOf(db, node.id),
  ]);
  return classifySuggestedLinks(node.id, type, candidates, { hasChildOf });
}
