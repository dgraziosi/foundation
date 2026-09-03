import { canChildOf, getParentTypes } from "./hierarchy.js";
import {
  hasHierarchyParent,
  hierarchySlug,
  isHierarchySlug,
  isUnconstrainedAssociativeSlug,
} from "./ontology-roles.js";
import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "./seeds.js";
import type { NodeType, RelationType } from "./types.js";

export type ExistingEdge = {
  from_id: string;
  to_id: string;
  relation_type: string;
};

export type LinkProposal = {
  from_id: string;
  to_id: string;
  relation_type: string;
  from_type: string;
  to_type: string;
  /** When true, rewrite a spine-fitting unconstrained associative into the hierarchy verb. Default off. */
  upgrade?: boolean;
};

export type ExistingLinkPair = {
  from_id: string;
  to_id: string;
  relation_type: string;
  from_type: string;
  to_type: string;
};

export type LinkValidationOk = {
  ok: true;
  relation_type: string;
  suggestion?: string;
};

export type LinkValidationErr = {
  ok: false;
  error: string;
  suggestion?: string;
};

export type LinkValidationResult = LinkValidationOk | LinkValidationErr;

export type LinkValidatorContext = {
  nodeTypes?: readonly NodeType[];
  relationTypes?: readonly RelationType[];
  existingEdges?: readonly ExistingEdge[];
};

function relationAllowsPair(
  relation: RelationType,
  fromType: string,
  toType: string,
): boolean {
  const sourceOk =
    relation.source_types.length === 0 || relation.source_types.includes(fromType);
  const targetOk =
    relation.target_types.length === 0 || relation.target_types.includes(toType);
  return sourceOk && targetOk;
}

export function listValidRelationSlugs(
  fromType: string,
  toType: string,
  ctx: Pick<LinkValidatorContext, "nodeTypes" | "relationTypes"> = {},
): string[] {
  const nodeTypes = ctx.nodeTypes ?? SEED_NODE_TYPES;
  const relationTypes = ctx.relationTypes ?? SEED_RELATION_TYPES;
  return relationTypes
    .filter((relation) => {
      if (!relationAllowsPair(relation, fromType, toType)) {
        return false;
      }
      if (relation.kind === "hierarchy") {
        return canChildOf(fromType, toType, nodeTypes);
      }
      return true;
    })
    .map((relation) => relation.slug);
}

/**
 * Pure link rules. No I/O.
 * Pipeline: unknown relation → self-link → duplicate on proposed type →
 * symmetric duplicate on proposed type → optional unconstrained→hierarchy upgrade →
 * re-resolve + registry constraints → hierarchy parent_types + uniqueness.
 */
export function validateLink(
  proposal: LinkProposal,
  ctx: LinkValidatorContext = {},
): LinkValidationResult {
  const nodeTypes = ctx.nodeTypes ?? SEED_NODE_TYPES;
  const relationTypes = ctx.relationTypes ?? SEED_RELATION_TYPES;
  const existingEdges = ctx.existingEdges ?? [];

  const known = relationTypes.map((relation) => relation.slug);
  let relationType = proposal.relation_type;
  const listed = relationTypes.find((relation) => relation.slug === relationType);
  if (!listed) {
    return {
      ok: false,
      error: `Unknown relation_type "${relationType}"`,
      suggestion: `Known relation types: ${known.join(", ")}`,
    };
  }

  if (proposal.from_id === proposal.to_id) {
    return { ok: false, error: "Cannot link a node to itself" };
  }

  const exact = existingEdges.find(
    (edge) =>
      edge.from_id === proposal.from_id &&
      edge.to_id === proposal.to_id &&
      edge.relation_type === relationType,
  );
  if (exact) {
    return {
      ok: false,
      error: `Duplicate edge: ${relationType} already exists from ${proposal.from_id} to ${proposal.to_id}`,
    };
  }

  if (listed.is_symmetric) {
    const reverse = existingEdges.find(
      (edge) =>
        edge.from_id === proposal.to_id &&
        edge.to_id === proposal.from_id &&
        edge.relation_type === relationType,
    );
    if (reverse) {
      return {
        ok: false,
        error: `Symmetric duplicate: ${relationType} already exists in the reverse direction`,
      };
    }
  }

  const hierarchy = hierarchySlug(relationTypes);
  let upgradeSuggestion: string | undefined;
  if (
    hierarchy &&
    isUnconstrainedAssociativeSlug(relationType, relationTypes) &&
    canChildOf(proposal.from_type, proposal.to_type, nodeTypes)
  ) {
    if (proposal.upgrade) {
      relationType = hierarchy;
    } else {
      upgradeSuggestion = `These types fit the spine as ${hierarchy} (${proposal.from_type} → ${proposal.to_type}). Retry with relation_type "${hierarchy}", or pass upgrade: true.`;
    }
  }

  const typesOk = validateExistingLink(
    {
      from_id: proposal.from_id,
      to_id: proposal.to_id,
      relation_type: relationType,
      from_type: proposal.from_type,
      to_type: proposal.to_type,
    },
    { nodeTypes, relationTypes },
  );
  if (!typesOk.ok) {
    return typesOk;
  }

  if (isHierarchySlug(typesOk.relation_type, relationTypes)) {
    if (hasHierarchyParent(proposal.from_id, existingEdges, relationTypes)) {
      return {
        ok: false,
        error: `Node already has a ${hierarchy ?? typesOk.relation_type} parent (at most one hierarchy parent)`,
      };
    }
  }

  return {
    ok: true,
    relation_type: typesOk.relation_type,
    ...(upgradeSuggestion ? { suggestion: upgradeSuggestion } : {}),
  };
}

export function validateExistingLink(
  pair: ExistingLinkPair,
  ctx: Pick<LinkValidatorContext, "nodeTypes" | "relationTypes"> = {},
): LinkValidationResult {
  const nodeTypes = ctx.nodeTypes ?? SEED_NODE_TYPES;
  const relationTypes = ctx.relationTypes ?? SEED_RELATION_TYPES;
  const known = relationTypes.map((relation) => relation.slug);
  const relation = relationTypes.find((item) => item.slug === pair.relation_type);
  if (!relation) {
    return {
      ok: false,
      error: `Unknown relation_type "${pair.relation_type}"`,
      suggestion: `Known relation types: ${known.join(", ")}`,
    };
  }

  if (relation.source_types.length > 0 && !relation.source_types.includes(pair.from_type)) {
    const swap = listValidRelationSlugs(pair.to_type, pair.from_type, {
      nodeTypes,
      relationTypes,
    });
    return {
      ok: false,
      error: `Relation "${pair.relation_type}" does not allow source type "${pair.from_type}"`,
      suggestion: swap.includes(pair.relation_type)
        ? `Swap source and target. Allowed source types: ${relation.source_types.join(", ")}`
        : `Allowed source types: ${relation.source_types.join(", ")}. Valid verbs ${pair.from_type} → ${pair.to_type}: ${listValidRelationSlugs(pair.from_type, pair.to_type, { nodeTypes, relationTypes }).join(", ") || "none"}`,
    };
  }

  if (relation.target_types.length > 0 && !relation.target_types.includes(pair.to_type)) {
    const swapWorks =
      (relation.source_types.length === 0 || relation.source_types.includes(pair.to_type)) &&
      relation.target_types.includes(pair.from_type);
    const valid = listValidRelationSlugs(pair.from_type, pair.to_type, {
      nodeTypes,
      relationTypes,
    });
    return {
      ok: false,
      error: `Relation "${pair.relation_type}" does not allow target type "${pair.to_type}"`,
      suggestion: swapWorks
        ? `Swap source and target. Allowed target types: ${relation.target_types.join(", ")}`
        : `Allowed target types: ${relation.target_types.join(", ")}. Valid verbs ${pair.from_type} → ${pair.to_type}: ${valid.join(", ") || "none"}`,
    };
  }

  if (relation.kind === "hierarchy" && !canChildOf(pair.from_type, pair.to_type, nodeTypes)) {
    const allowed = getParentTypes(pair.from_type, nodeTypes);
    const valid = listValidRelationSlugs(pair.from_type, pair.to_type, {
      nodeTypes,
      relationTypes,
    });
    return {
      ok: false,
      error: `"${pair.from_type}" cannot be ${pair.relation_type} "${pair.to_type}"`,
      suggestion: allowed.length
        ? `Allowed parent types for ${pair.from_type}: ${allowed.join(", ")}. Other valid verbs: ${valid.join(", ") || "none"}`
        : `${pair.from_type} does not take a hierarchy parent. Valid verbs: ${valid.join(", ") || "none"}`,
    };
  }

  return { ok: true, relation_type: pair.relation_type };
}

export type LinkBatchDuplicateErr = {
  ok: false;
  index: number;
  other: number;
  kind: "exact" | "symmetric";
  error: string;
  suggestion: string;
};

/**
 * In-batch exact and symmetric duplicates on the proposed relation
 * (before upgrade), matching validateLink's duplicate-first pipeline.
 */
export function findInBatchLinkDuplicate(
  proposals: readonly Pick<LinkProposal, "from_id" | "to_id" | "relation_type">[],
  ctx: Pick<LinkValidatorContext, "relationTypes"> = {},
): LinkBatchDuplicateErr | null {
  const relationTypes = ctx.relationTypes ?? SEED_RELATION_TYPES;
  for (let index = 0; index < proposals.length; index += 1) {
    const current = proposals[index]!;
    for (let other = 0; other < index; other += 1) {
      const prior = proposals[other]!;
      if (
        current.from_id === prior.from_id &&
        current.to_id === prior.to_id &&
        current.relation_type === prior.relation_type
      ) {
        return {
          ok: false,
          index,
          other,
          kind: "exact",
          error: `Duplicate edge in batch (same as edges[${other}])`,
          suggestion: "Remove the extra item, or change from, to, or relation.",
        };
      }
      const listed = relationTypes.find((relation) => relation.slug === current.relation_type);
      if (
        listed?.is_symmetric &&
        current.relation_type === prior.relation_type &&
        current.from_id === prior.to_id &&
        current.to_id === prior.from_id
      ) {
        return {
          ok: false,
          index,
          other,
          kind: "symmetric",
          error: `Symmetric duplicate in batch (same as edges[${other}])`,
          suggestion: "Keep one direction of this relation.",
        };
      }
    }
  }
  return null;
}

export type LinkSequenceOk = {
  ok: true;
  results: LinkValidationOk[];
};

export type LinkSequenceErr = {
  ok: false;
  index: number;
  error: string;
  suggestion?: string;
};

/**
 * Validate edges in order. Each accepted edge (resolved relation) is visible
 * to later edges, including a second hierarchy parent from the same source.
 */
export function validateLinkSequence(
  proposals: readonly LinkProposal[],
  ctx: LinkValidatorContext = {},
): LinkSequenceOk | LinkSequenceErr {
  const existingEdges = [...(ctx.existingEdges ?? [])];
  const results: LinkValidationOk[] = [];
  for (let index = 0; index < proposals.length; index += 1) {
    const proposal = proposals[index]!;
    const result = validateLink(proposal, { ...ctx, existingEdges });
    if (!result.ok) {
      return {
        ok: false,
        index,
        error: result.error,
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
      };
    }
    existingEdges.push({
      from_id: proposal.from_id,
      to_id: proposal.to_id,
      relation_type: result.relation_type,
    });
    results.push(result);
  }
  return { ok: true, results };
}
