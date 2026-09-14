import { ALIASES_MAX, wellFormedAliasStrings } from "./aliases.js";
import { isToolError, toolError, type ToolError } from "./mcp-io.js";
import { nameNorm } from "./name-norm.js";
import { receiptFromData } from "./receipt.js";
import { repoFromData } from "./repo.js";
import { EdgeSchema, NodeSchema } from "./types.js";
import { urlIdentityFromMetadata } from "./url-identity.js";
import { z } from "zod";

export const MERGE_CONFIRM_SUGGESTION =
  "Pass confirm: true. Merge rewrites edges and declared refs onto keep, unions aliases, and soft-deletes drop.";

export const MERGE_TYPE_SUGGESTION = "Merge only same-type live nodes.";

export const MERGE_SELF_SUGGESTION = "Pass two distinct live ids for keep and drop.";

export const MERGE_PARENT_SUGGESTION =
  "Unlink one child_of first (unlink with if-match), then retry merge.";

export const MERGE_IDENTITY_URL_SUGGESTION =
  "Clear one url with upsert (url: null) and if-match, then retry merge.";

export const MERGE_IDENTITY_REPO_SUGGESTION =
  "Clear one repo with upsert (data.repo: null) and if-match, then retry merge.";

export const MERGE_IDENTITY_RECEIPT_SUGGESTION =
  "Clear one receipt with upsert (data.receipt: null) and if-match, then retry merge.";

export function missingMergeConfirm(confirm: boolean | undefined): ToolError | null {
  if (confirm === true) {
    return null;
  }
  return toolError("merge needs confirm: true", MERGE_CONFIRM_SUGGESTION);
}

export function unionAliasesForMerge(
  keepData: Record<string, unknown> | undefined,
  dropData: Record<string, unknown> | undefined,
): string[] | ToolError {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...wellFormedAliasStrings(keepData), ...wellFormedAliasStrings(dropData)]) {
    const norm = nameNorm(item);
    if (!norm || seen.has(norm)) {
      continue;
    }
    seen.add(norm);
    out.push(item);
  }
  if (out.length > ALIASES_MAX) {
    return toolError(
      `Cannot merge: unioned aliases would exceed ${ALIASES_MAX}`,
      "Trim aliases on keep or drop with upsert, then retry merge.",
    );
  }
  return out;
}

export const IDENTITY_BAGS = ["url", "repo", "receipt"] as const;
export type IdentityBag = (typeof IDENTITY_BAGS)[number];

export type IdentityRef = { system: string; id: string };

export type IdentityDecision =
  | { bag: IdentityBag; action: "keep" }
  | { bag: IdentityBag; action: "move"; value: IdentityRef }
  | { bag: IdentityBag; action: "conflict" };

export function decideIdentityBag(
  bag: IdentityBag,
  keep: IdentityRef | undefined,
  drop: IdentityRef | undefined,
): IdentityDecision {
  if (keep && drop) {
    if (keep.system === drop.system && keep.id === drop.id) {
      return { bag, action: "keep" };
    }
    return { bag, action: "conflict" };
  }
  if (drop && !keep) {
    return { bag, action: "move", value: drop };
  }
  return { bag, action: "keep" };
}

export function identityConflictError(bag: IdentityBag): ToolError {
  if (bag === "url") {
    return toolError(
      "Cannot merge: keep and drop hold conflicting url identity",
      MERGE_IDENTITY_URL_SUGGESTION,
    );
  }
  if (bag === "repo") {
    return toolError(
      "Cannot merge: keep and drop hold conflicting repo identity",
      MERGE_IDENTITY_REPO_SUGGESTION,
    );
  }
  return toolError(
    "Cannot merge: keep and drop hold conflicting receipt identity",
    MERGE_IDENTITY_RECEIPT_SUGGESTION,
  );
}

export function identityRefFromNode(
  bag: IdentityBag,
  node: { data?: Record<string, unknown>; metadata?: Record<string, unknown> },
): IdentityRef | undefined | ToolError {
  if (bag === "url") {
    return urlIdentityFromMetadata(node.metadata ?? {});
  }
  if (bag === "repo") {
    return repoFromData(node.data ?? {});
  }
  return receiptFromData(node.data ?? {});
}

export function planIdentityMoves(
  keep: { data?: Record<string, unknown>; metadata?: Record<string, unknown> },
  drop: { data?: Record<string, unknown>; metadata?: Record<string, unknown> },
): { moves: IdentityBag[] } | ToolError {
  const moves: IdentityBag[] = [];
  for (const bag of IDENTITY_BAGS) {
    const keepRef = identityRefFromNode(bag, keep);
    if (isToolError(keepRef)) {
      return keepRef;
    }
    const dropRef = identityRefFromNode(bag, drop);
    if (isToolError(dropRef)) {
      return dropRef;
    }
    const decision = decideIdentityBag(bag, keepRef, dropRef);
    if (decision.action === "conflict") {
      return identityConflictError(bag);
    }
    if (decision.action === "move") {
      moves.push(bag);
    }
  }
  return { moves };
}

export const MergeEdgeDispositionSchema = z.enum(["retarget", "drop_self", "drop_duplicate"]);
export type MergeEdgeDisposition = z.infer<typeof MergeEdgeDispositionSchema>;

export const MergeEdgeChangeSchema = z.object({
  edge: EdgeSchema,
  disposition: MergeEdgeDispositionSchema,
  next_from_id: z.string().uuid().optional(),
  next_to_id: z.string().uuid().optional(),
});
export type MergeEdgeChange = z.infer<typeof MergeEdgeChangeSchema>;

export const MergeRefChangeSchema = z.object({
  node_id: z.string().uuid(),
  field: z.string().min(1),
  from: z.string().uuid(),
  to: z.string().uuid(),
  before_updated_at: z.string().min(1),
  after_updated_at: z.string().min(1).optional(),
});
export type MergeRefChange = z.infer<typeof MergeRefChangeSchema>;

export const MergeSnapshotSchema = z.object({
  keep: NodeSchema,
  drop: NodeSchema,
  edges: z.array(MergeEdgeChangeSchema),
  refs: z.array(MergeRefChangeSchema),
  identity_moves: z.array(z.enum(IDENTITY_BAGS)),
});
export type MergeSnapshot = z.infer<typeof MergeSnapshotSchema>;

export function parseMergeSnapshot(value: unknown): MergeSnapshot | null {
  const parsed = MergeSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
