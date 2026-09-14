import {
  deleteEdgeById,
  getNodeById,
  getNodeType,
  insertActivity,
  listInboundRefPointers,
  listIncidentEdges,
  listNodeTypes,
  listRelationTypes,
  restoreEdge,
  restoreNode,
  restoreNodeSnapshot,
  retargetEdge,
  softDeleteNode,
  updateNode,
  withTransaction,
  isUniqueViolation,
  uniqueViolationConstraint,
  type Pool,
  type PoolClient,
} from "@foundation/db";
import {
  MERGE_PARENT_SUGGESTION,
  MERGE_SELF_SUGGESTION,
  MERGE_TYPE_SUGGESTION,
  assertIfMatch,
  isHierarchySlug,
  isToolError,
  missingDestructive,
  missingMergeConfirm,
  parseMergeSnapshot,
  planIdentityMoves,
  toolError,
  unionAliasesForMerge,
  validateExistingLink,
  type Activity,
  type Edge,
  type IdentityBag,
  type IncidentEdge,
  type MergeEdgeChange,
  type MergeInput,
  type MergeRefChange,
  type MergeSnapshot,
  type Node,
  type RelationType,
  type ToolError,
} from "@foundation/schema";
import { writerFrom, type WriteContext } from "./write-context.js";

function retargetId(id: string, dropId: string, keepId: string): string {
  return id === dropId ? keepId : id;
}

function uniqueEdges(edges: IncidentEdge[]): IncidentEdge[] {
  const seen = new Set<string>();
  const out: IncidentEdge[] = [];
  for (const edge of edges) {
    if (seen.has(edge.id)) {
      continue;
    }
    seen.add(edge.id);
    out.push(edge);
  }
  return out;
}

function existingTriples(edges: Array<{ from_id: string; to_id: string; relation_type: string }>) {
  return edges.map((edge) => ({
    from_id: edge.from_id,
    to_id: edge.to_id,
    relation_type: edge.relation_type,
  }));
}

function planDropEdges(
  keep: Node,
  drop: Node,
  keepEdges: IncidentEdge[],
  dropEdges: IncidentEdge[],
  relationTypes: RelationType[],
  nodeTypes: Awaited<ReturnType<typeof listNodeTypes>>,
): MergeEdgeChange[] | ToolError {
  const existing = existingTriples(
    keepEdges.filter((edge) => edge.from_id !== drop.id && edge.to_id !== drop.id),
  );
  const plans: MergeEdgeChange[] = [];
  for (const edge of uniqueEdges(dropEdges)) {
    const nextFrom = retargetId(edge.from_id, drop.id, keep.id);
    const nextTo = retargetId(edge.to_id, drop.id, keep.id);
    const snapshot = {
      id: edge.id,
      from_id: edge.from_id,
      to_id: edge.to_id,
      relation_type: edge.relation_type,
      metadata: edge.metadata,
      created_at: edge.created_at,
    } satisfies Edge;
    if (nextFrom === nextTo) {
      plans.push({ edge: snapshot, disposition: "drop_self" });
      continue;
    }
    const listed = relationTypes.find((relation) => relation.slug === edge.relation_type);
    const exact = existing.find(
      (item) =>
        item.from_id === nextFrom &&
        item.to_id === nextTo &&
        item.relation_type === edge.relation_type,
    );
    if (exact) {
      plans.push({ edge: snapshot, disposition: "drop_duplicate" });
      continue;
    }
    if (listed?.is_symmetric) {
      const reverse = existing.find(
        (item) =>
          item.from_id === nextTo &&
          item.to_id === nextFrom &&
          item.relation_type === edge.relation_type,
      );
      if (reverse) {
        plans.push({ edge: snapshot, disposition: "drop_duplicate" });
        continue;
      }
    }
    if (isHierarchySlug(edge.relation_type, relationTypes) && nextFrom === keep.id) {
      const keepParent = existing.find(
        (item) => item.from_id === keep.id && isHierarchySlug(item.relation_type, relationTypes),
      );
      if (keepParent && keepParent.to_id !== nextTo) {
        return toolError(
          "Cannot merge: keep and drop have different hierarchy parents",
          MERGE_PARENT_SUGGESTION,
        );
      }
      if (keepParent && keepParent.to_id === nextTo) {
        plans.push({ edge: snapshot, disposition: "drop_duplicate" });
        continue;
      }
    }
    const fromType = nextFrom === keep.id ? keep.type : edge.neighbor.type;
    const toType = nextTo === keep.id ? keep.type : edge.neighbor.type;
    const typesOk = validateExistingLink(
      {
        from_id: nextFrom,
        to_id: nextTo,
        relation_type: edge.relation_type,
        from_type: fromType,
        to_type: toType,
      },
      { nodeTypes, relationTypes },
    );
    if (!typesOk.ok) {
      return toolError(
        `Cannot merge: retargeting ${edge.relation_type} onto keep would violate the ontology`,
        `${typesOk.error}. Unlink that edge first, then retry merge.`,
      );
    }
    plans.push({
      edge: snapshot,
      disposition: "retarget",
      next_from_id: nextFrom,
      next_to_id: nextTo,
    });
    existing.push({ from_id: nextFrom, to_id: nextTo, relation_type: edge.relation_type });
  }
  return plans;
}

async function loadLivePair(
  client: PoolClient,
  keepId: string,
  dropId: string,
): Promise<{ keep: Node; drop: Node } | ToolError> {
  const lockOrder = [keepId, dropId].sort();
  const locked = new Map<string, Node>();
  for (const id of lockOrder) {
    const node = await getNodeById(client, id, { includeDeleted: true, forUpdate: true });
    if (!node) {
      return toolError(
        `Node not found: ${id}`,
        "merge only combines two live nodes. Check the UUID from get.",
      );
    }
    locked.set(id, node);
  }
  return { keep: locked.get(keepId)!, drop: locked.get(dropId)! };
}

function aliasesChanged(keep: Node, unioned: string[]): boolean {
  const current = Array.isArray(keep.data.aliases)
    ? (keep.data.aliases as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  const wellFormed = current.map((item) => item.trim()).filter(Boolean);
  return JSON.stringify(wellFormed) !== JSON.stringify(unioned);
}

async function patchPointingNode(
  client: PoolClient,
  pointer: MergeRefChange,
  value: string,
): Promise<Node | ToolError> {
  const live = await getNodeById(client, pointer.node_id, { forUpdate: true });
  if (!live) {
    return toolError(
      `Node not found: ${pointer.node_id}`,
      "Call get and retry. A pointing record moved or was deleted.",
    );
  }
  const type = await getNodeType(client, live.type);
  if (!type) {
    return toolError(`Unknown type "${live.type}"`);
  }
  const next = await updateNode(client, live.id, {
    type: live.type,
    title: live.title,
    status: live.status,
    payload: live.payload,
    data: { ...live.data, [pointer.field]: value },
    metadata: live.metadata,
    base_updated_at: live.updated_at,
  });
  if (!next) {
    return toolError(
      "base_updated_at does not match current updated_at",
      "Call get and retry with the current updated_at as base_updated_at.",
    );
  }
  return next;
}

export async function mergeGraphNodes(
  pool: Pool,
  input: MergeInput,
  ctx?: WriteContext,
): Promise<{ ok: true; activity_id: string } | ToolError> {
  const scopeErr = missingDestructive("merge", ctx?.destructive);
  if (scopeErr) {
    return scopeErr;
  }
  const confirmErr = missingMergeConfirm(input.confirm);
  if (confirmErr) {
    return confirmErr;
  }
  if (input.keep === input.drop) {
    return toolError("Cannot merge a node with itself", MERGE_SELF_SUGGESTION);
  }
  const writer = writerFrom(ctx);
  return withTransaction(pool, async (client) => {
    const pair = await loadLivePair(client, input.keep, input.drop);
    if (isToolError(pair)) {
      return pair;
    }
    const { keep, drop } = pair;
    const keepStale = assertIfMatch("keep_base_updated_at", input.keep_base_updated_at, keep.updated_at);
    if (keepStale) {
      return keepStale;
    }
    const dropStale = assertIfMatch("drop_base_updated_at", input.drop_base_updated_at, drop.updated_at);
    if (dropStale) {
      return dropStale;
    }
    if (keep.deleted_at) {
      return toolError(
        `Node ${keep.id} is deleted`,
        "Restore via undo, then retry merge. Merge needs two live nodes.",
      );
    }
    if (drop.deleted_at) {
      return toolError(
        `Node ${drop.id} is deleted`,
        "Restore via undo, then retry merge. Merge needs two live nodes.",
      );
    }
    if (keep.type !== drop.type) {
      return toolError(
        `Cannot merge: keep is ${keep.type}, drop is ${drop.type}`,
        MERGE_TYPE_SUGGESTION,
      );
    }
    const identity = planIdentityMoves(keep, drop);
    if (isToolError(identity)) {
      return identity;
    }
    const unioned = unionAliasesForMerge(keep.data, drop.data);
    if (isToolError(unioned)) {
      return unioned;
    }
    const [nodeTypes, relationTypes, keepEdges, dropEdges, inbound] = await Promise.all([
      listNodeTypes(client),
      listRelationTypes(client),
      listIncidentEdges(client, keep.id),
      listIncidentEdges(client, drop.id),
      listInboundRefPointers(client, drop.id),
    ]);
    const edgePlans = planDropEdges(keep, drop, keepEdges, dropEdges, relationTypes, nodeTypes);
    if (isToolError(edgePlans)) {
      return edgePlans;
    }
    const refPlans: MergeRefChange[] = [];
    for (const pointer of inbound) {
      if (pointer.node_id === drop.id) {
        continue;
      }
      const pointing = await getNodeById(client, pointer.node_id, { forUpdate: true });
      if (!pointing) {
        continue;
      }
      refPlans.push({
        node_id: pointing.id,
        field: pointer.field,
        from: drop.id,
        to: keep.id,
        before_updated_at: pointing.updated_at,
      });
    }

    for (const plan of edgePlans) {
      if (plan.disposition === "retarget") {
        continue;
      }
      const removed = await deleteEdgeById(client, plan.edge.id);
      if (!removed) {
        return toolError(`Cannot merge: edge ${plan.edge.id} could not be dropped`);
      }
    }
    for (const plan of edgePlans) {
      if (plan.disposition !== "retarget") {
        continue;
      }
      const rewritten = await retargetEdge(client, plan.edge.id, {
        from_id: plan.next_from_id!,
        to_id: plan.next_to_id!,
      });
      if (!rewritten) {
        return toolError(`Cannot merge: edge ${plan.edge.id} could not be retargeted`);
      }
    }

    const afterRefs: MergeRefChange[] = [];
    for (const pointer of refPlans) {
      if (pointer.node_id === keep.id) {
        continue;
      }
      const patched = await patchPointingNode(client, pointer, keep.id);
      if (isToolError(patched)) {
        return patched;
      }
      afterRefs.push({ ...pointer, after_updated_at: patched.updated_at });
    }

    const deleted = await softDeleteNode(client, drop.id, {
      base_updated_at: drop.updated_at,
    });
    if (!deleted) {
      return toolError(
        "drop_base_updated_at does not match current updated_at",
        "Call get and retry with the current updated_at as drop_base_updated_at.",
      );
    }

    const nextData: Record<string, unknown> = { ...keep.data };
    const nextMeta: Record<string, unknown> = { ...keep.metadata };
    let keepNeedsWrite = false;
    if (aliasesChanged(keep, unioned)) {
      nextData.aliases = unioned;
      keepNeedsWrite = true;
    }
    if (identity.moves.includes("repo")) {
      nextData.repo = drop.data.repo;
      keepNeedsWrite = true;
    }
    if (identity.moves.includes("receipt")) {
      nextData.receipt = drop.data.receipt;
      keepNeedsWrite = true;
    }
    if (identity.moves.includes("url")) {
      nextMeta.url = drop.metadata.url;
      keepNeedsWrite = true;
    }
    for (const pointer of refPlans) {
      if (pointer.node_id !== keep.id) {
        continue;
      }
      nextData[pointer.field] = keep.id;
      keepNeedsWrite = true;
    }

    let afterKeep = keep;
    if (keepNeedsWrite) {
      const updated = await updateNode(client, keep.id, {
        type: keep.type,
        title: keep.title,
        status: keep.status,
        payload: keep.payload,
        data: nextData,
        metadata: nextMeta,
        base_updated_at: keep.updated_at,
      });
      if (!updated) {
        return toolError(
          "keep_base_updated_at does not match current updated_at",
          "Call get and retry with the current updated_at as keep_base_updated_at.",
        );
      }
      afterKeep = updated;
    }
    for (const pointer of refPlans) {
      if (pointer.node_id === keep.id) {
        afterRefs.push({ ...pointer, after_updated_at: afterKeep.updated_at });
      }
    }

    const before: MergeSnapshot = {
      keep,
      drop,
      edges: edgePlans,
      refs: refPlans,
      identity_moves: identity.moves,
    };
    const after: MergeSnapshot = {
      keep: afterKeep,
      drop: deleted,
      edges: edgePlans,
      refs: afterRefs,
      identity_moves: identity.moves,
    };
    const activity = await insertActivity(client, {
      ...writer,
      action: "merge",
      target_kind: "node",
      target_id: keep.id,
      before,
      after,
    });
    return { ok: true as const, activity_id: activity.id };
  });
}

function identityUndoError(constraint: string | undefined): ToolError {
  if (constraint === "nodes_receipt_live_uidx") {
    return toolError(
      "Cannot undo merge: restoring drop would duplicate a live receipt (system, id)",
      "Search receipt to find the live node. Change or delete the live receipt first.",
    );
  }
  if (constraint === "nodes_repo_live_uidx") {
    return toolError(
      "Cannot undo merge: restoring drop would duplicate a live repo (system, id)",
      "Search repo to find the live node. Do not twin. Change or delete the live repo first.",
    );
  }
  return toolError(
    "Cannot undo merge: restoring drop would duplicate a live url (system, id)",
    "Search url to find the live node. Do not twin. Change or delete the live url first.",
  );
}

export async function invertMergeActivity(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const before = parseMergeSnapshot(row.before);
  const after = parseMergeSnapshot(row.after);
  if (!before || !after) {
    return toolError("Merge activity is missing a keep/drop snapshot", "This row cannot be undone.");
  }
  const liveKeep = await getNodeById(client, before.keep.id, { forUpdate: true });
  if (!liveKeep) {
    return toolError(
      `Cannot undo merge: keep ${before.keep.id} is missing or deleted`,
      "Undo of merge restores drop onto the live keep node.",
    );
  }
  const tombstone = await getNodeById(client, before.drop.id, {
    includeDeleted: true,
    forUpdate: true,
  });
  if (!tombstone) {
    return toolError(`Cannot undo merge: drop ${before.drop.id} not found`);
  }
  if (!tombstone.deleted_at) {
    return toolError(
      `Cannot undo merge: drop ${before.drop.id} is not deleted`,
      "It may already have been restored.",
    );
  }

  for (const pointer of after.refs) {
    if (pointer.node_id === before.keep.id) {
      continue;
    }
    const live = await getNodeById(client, pointer.node_id, { forUpdate: true });
    if (!live) {
      return toolError(
        `Cannot undo merge: pointing record ${pointer.node_id} is missing`,
        "Restore that record first, then retry undo.",
      );
    }
    if (pointer.after_updated_at && live.updated_at !== pointer.after_updated_at) {
      return toolError(
        `Cannot undo merge: record ${live.id} changed after merge`,
        "Call get on that record. Apply a new mutation if you need a different state.",
      );
    }
    const restored = await patchPointingNode(client, pointer, pointer.from);
    if (isToolError(restored)) {
      return restored;
    }
  }

  for (const plan of before.edges) {
    if (plan.disposition !== "retarget") {
      continue;
    }
    const rewritten = await retargetEdge(client, plan.edge.id, {
      from_id: plan.edge.from_id,
      to_id: plan.edge.to_id,
    });
    if (!rewritten) {
      return toolError(
        `Cannot undo merge: edge ${plan.edge.id} could not be restored`,
        "The edge may have been unlinked after merge.",
      );
    }
  }
  for (const plan of before.edges) {
    if (plan.disposition === "retarget") {
      continue;
    }
    try {
      await restoreEdge(client, plan.edge);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return toolError(
          "Cannot undo merge: restoring a dropped edge would duplicate a live edge",
          "Unlink the current edge first, or leave the graph as-is.",
        );
      }
      throw error;
    }
  }

  try {
    const restoredKeep = await restoreNodeSnapshot(client, before.keep);
    if (!restoredKeep) {
      return toolError(`Cannot undo merge: keep ${before.keep.id} not found`);
    }
    await restoreNodeSnapshot(client, before.drop);
    const restoredDrop = await restoreNode(client, before.drop.id);
    if (!restoredDrop) {
      return toolError(`Cannot undo merge: drop ${before.drop.id} not found`);
    }
    return {
      action: "merge",
      before: row.after,
      after: {
        keep: restoredKeep,
        drop: restoredDrop,
        edges: before.edges,
        refs: before.refs,
        identity_moves: before.identity_moves,
      },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return identityUndoError(uniqueViolationConstraint(error));
    }
    throw error;
  }
}

export async function assertMergeUndoIfMatch(
  client: PoolClient,
  row: Activity,
  provided: string | undefined,
): Promise<ToolError | null> {
  const before = parseMergeSnapshot(row.before);
  if (!before) {
    return null;
  }
  const keep = await getNodeById(client, before.keep.id, { forUpdate: true });
  if (!keep) {
    return toolError(
      `Node not found: ${before.keep.id}`,
      "Call get and retry with the current updated_at as base_updated_at.",
    );
  }
  return assertIfMatch("base_updated_at", provided, keep.updated_at);
}

export type { IdentityBag };
