import { z } from "zod";
import { BLOB_BASE64_MAX_CHARS } from "./blobs.js";
import { DataEqualsSchema, hasDataEqualsFilter } from "./data-equals.js";
import { isIsoDate } from "./due.js";
import {
  ActivityActionSchema,
  ActivityActorSchema,
  ActivitySchema,
  BlobSchema,
  EdgeSchema,
  JsonObjectSchema,
  NodeSchema,
  NodeStatusSchema,
  NodeTypeSchema,
  OriginRefSchema,
  PayloadStorageSchema,
  RelationKindSchema,
  RelationTypeSchema,
  TypeKindSchema,
  ViewEngineIdSchema,
} from "./types.js";

export const ToolErrorSchema = z.object({
  error: z.string(),
  suggestion: z.string().optional(),
  /** Present on create-time duplicate preflight refusals. */
  outcome: z.enum(["exact", "alias", "ambiguous"]).optional(),
  candidates: z.array(z.unknown()).optional(),
});
export type ToolError = {
  error: string;
  suggestion?: string;
  outcome?: "exact" | "alias" | "ambiguous";
  candidates?: LookupCandidate[];
};

export function toolError(error: string, suggestion?: string): ToolError {
  return suggestion === undefined ? { error } : { error, suggestion };
}

export function isToolError(value: unknown): value is ToolError {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("error" in value) || typeof (value as { error: unknown }).error !== "string") {
    return false;
  }
  return Object.keys(value).every(
    (key) => key === "error" || key === "suggestion" || key === "outcome" || key === "candidates",
  );
}

export const SlugSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "slug must start with a letter and contain only lowercase letters, digits, and underscores",
  );

export const GetInputSchema = z.object({
  id: z.string().uuid(),
  /** When true, blob payloads may include a base64 `body` if under the inline cap. Default false. */
  include_body: z.boolean().optional(),
});

export const NeighborRefSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  type: z.string().min(1),
});
export type NeighborRef = z.infer<typeof NeighborRefSchema>;

export const IncidentEdgeSchema = EdgeSchema.extend({
  direction: z.enum(["in", "out"]),
  /** The other endpoint. Agents should read title here, not UUID-only hops. */
  neighbor: NeighborRefSchema,
});
export type IncidentEdge = z.infer<typeof IncidentEdgeSchema>;

export const SuggestedLinkKindSchema = z.enum(["child_of", "about", "relates_to"]);

export const SuggestedLinkSchema = z.object({
  kind: SuggestedLinkKindSchema,
  /** Live node that already exists. Suggestions never invent a type or write an edge. */
  target: NeighborRefSchema,
  reason: z.string().min(1),
});
export type SuggestedLink = z.infer<typeof SuggestedLinkSchema>;

export const GetSuccessSchema = z.object({
  node: NodeSchema,
  edges: z.array(IncidentEdgeSchema),
  blob: BlobSchema.optional(),
  /** Title-FTS proposals. Empty when none, including an empty graph. Never creates an edge. */
  suggested_links: z.array(SuggestedLinkSchema),
});

/** Upsert ingest: inline body, existing blob_id, bytes_base64, or uploads source_path. */
export const UpsertPayloadSchema = z
  .object({
    media_type: z.string().min(1),
    storage: PayloadStorageSchema,
    body: z.string().optional(),
    blob_id: z.string().uuid().optional(),
    bytes_base64: z.string().max(BLOB_BASE64_MAX_CHARS).optional(),
    source_path: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.storage === "inline") {
      if (value.body === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "inline payload requires body",
          path: ["body"],
        });
      }
      return;
    }
    const methods = [value.blob_id, value.bytes_base64, value.source_path].filter(
      (item) => item !== undefined,
    );
    if (methods.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "blob payload requires blob_id, bytes_base64, or source_path",
        path: ["blob_id"],
      });
    }
    if (methods.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pass only one of blob_id, bytes_base64, or source_path",
        path: ["blob_id"],
      });
    }
  });
export type UpsertPayload = z.infer<typeof UpsertPayloadSchema>;

/** Who wrote — stored on the activity row. Not a permission gate. */
export const WriterIdentitySchema = z.object({
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type WriterIdentity = z.infer<typeof WriterIdentitySchema>;

export const UpsertInputSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.string().min(1),
  title: z.string().min(1),
  payload: UpsertPayloadSchema.optional(),
  data: JsonObjectSchema.optional(),
  status: NodeStatusSchema.optional(),
  metadata: JsonObjectSchema.optional(),
  /** Required on update: node's current `updated_at` from get. */
  base_updated_at: z.string().min(1).optional(),
  /** Create only: same key returns the existing node instead of a twin. */
  idempotency_key: z.string().trim().min(1).max(200).optional(),
  /**
   * Create only: write even when lookup finds an exact title or unique exact alias.
   * Same-name entities stay allowed with this flag. Ignored on update.
   */
  allow_duplicate: z.boolean().optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type UpsertInput = z.infer<typeof UpsertInputSchema>;

export const DeleteInputSchema = z.object({
  id: z.string().uuid(),
  confirm: z.boolean().optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});

export const MutationOkSchema = z.object({
  ok: z.literal(true),
  activity_id: z.string().uuid(),
});

export const LINK_BATCH_MAX = 20;

export const LINK_FORM_SUGGESTION =
  "Use from_id, to_id, and relation_type for one edge, or edges (max 20) for several.";

export const LINK_INCOMPLETE_SUGGESTION =
  "Each edge needs from_id, to_id, relation_type, and endpoint timestamps from get.";

export const LINK_BATCH_MAX_SUGGESTION =
  "Pass edges with 1 to 20 items, or use from_id, to_id, and relation_type for one edge.";

export const LINK_CAS_AGREE_SUGGESTION =
  "Use one updated_at from get for that node on every edge that touches it.";

export const LinkEdgeItemSchema = z.object({
  from_id: z.string().uuid(),
  to_id: z.string().uuid(),
  relation_type: z.string().min(1),
  upgrade: z.boolean().optional(),
  metadata: JsonObjectSchema.optional(),
  /** Required: `from` node's `updated_at` from get. */
  from_base_updated_at: z.string().min(1).optional(),
  /** Required: `to` node's `updated_at` from get. */
  to_base_updated_at: z.string().min(1).optional(),
});
export type LinkEdgeItem = z.infer<typeof LinkEdgeItemSchema>;

export const LinkInputSchema = z.object({
  from_id: z.string().uuid().optional(),
  to_id: z.string().uuid().optional(),
  relation_type: z.string().min(1).optional(),
  upgrade: z.boolean().optional(),
  metadata: JsonObjectSchema.optional(),
  /** Required: `from` node's `updated_at` from get. */
  from_base_updated_at: z.string().min(1).optional(),
  /** Required: `to` node's `updated_at` from get. */
  to_base_updated_at: z.string().min(1).optional(),
  /** 1–20 edges. Pass this or the one-edge fields, not both. */
  edges: z.array(LinkEdgeItemSchema).min(1).max(LINK_BATCH_MAX).optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type LinkInput = z.infer<typeof LinkInputSchema>;

export const LinkItemSuccessSchema = z.object({
  edge: EdgeSchema,
  activity_id: z.string().uuid(),
  suggestion: z.string().optional(),
});
export type LinkItemSuccess = z.infer<typeof LinkItemSuccessSchema>;

export const LinkSuccessSchema = z.object({
  /** Always present. Input order. One receipt per written edge. */
  links: z.array(LinkItemSuccessSchema).min(1).max(LINK_BATCH_MAX),
  /** One-edge form only — the same item as `links[0]`. */
  edge: EdgeSchema.optional(),
  activity_id: z.string().uuid().optional(),
  suggestion: z.string().optional(),
});
export type LinkSuccess = z.infer<typeof LinkSuccessSchema>;

const LINK_FLAT_KEYS = [
  "from_id",
  "to_id",
  "relation_type",
  "upgrade",
  "metadata",
  "from_base_updated_at",
  "to_base_updated_at",
] as const;

export function linkInputHasFlatFields(input: LinkInput): boolean {
  return LINK_FLAT_KEYS.some((key) => input[key] !== undefined);
}

export type NormalizedLinkEdges = {
  form: "flat" | "batch";
  edges: LinkEdgeItem[];
};

/** Two forms, not both. Cap and empty `edges` are also enforced in Zod. */
export function normalizeLinkEdges(input: LinkInput): NormalizedLinkEdges | ToolError {
  const hasFlat = linkInputHasFlatFields(input);
  const hasEdges = input.edges !== undefined;
  if (hasFlat && hasEdges) {
    return toolError("Pass either a single edge or edges[], not both", LINK_FORM_SUGGESTION);
  }
  if (hasEdges) {
    const edges = input.edges ?? [];
    if (edges.length === 0) {
      return toolError("edges must contain at least one item", LINK_BATCH_MAX_SUGGESTION);
    }
    if (edges.length > LINK_BATCH_MAX) {
      return toolError(
        `edges accepts at most ${LINK_BATCH_MAX} items`,
        LINK_BATCH_MAX_SUGGESTION,
      );
    }
    return { form: "batch", edges };
  }
  if (
    input.from_id === undefined ||
    input.to_id === undefined ||
    input.relation_type === undefined
  ) {
    return toolError(
      "Pass from_id, to_id, and relation_type for one edge, or edges (1 to 20) for several",
      LINK_INCOMPLETE_SUGGESTION,
    );
  }
  return {
    form: "flat",
    edges: [
      {
        from_id: input.from_id,
        to_id: input.to_id,
        relation_type: input.relation_type,
        upgrade: input.upgrade,
        metadata: input.metadata,
        from_base_updated_at: input.from_base_updated_at,
        to_base_updated_at: input.to_base_updated_at,
      },
    ],
  };
}

export const UnlinkInputSchema = z.object({
  from_id: z.string().uuid(),
  to_id: z.string().uuid(),
  relation_type: z.string().min(1),
  confirm: z.boolean().optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});

export const InspectOntologyInputSchema = z.object({
  kind: z.enum(["types", "relations", "all"]).optional(),
});

export const InspectOntologySuccessSchema = z.object({
  types: z.array(NodeTypeSchema),
  relations: z.array(RelationTypeSchema),
});

export const ManageTypeInputSchema = z.object({
  action: z.enum(["create", "update", "retire"]),
  slug: SlugSchema,
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  kind: TypeKindSchema.optional(),
  parent_types: z.array(z.string()).optional(),
  json_schema: z.unknown().nullable().optional(),
  views: z.array(ViewEngineIdSchema).optional(),
  default_view: ViewEngineIdSchema.optional(),
  /** Required when action is retire. */
  confirm: z.boolean().optional(),
  /** Permanently drop leftover soft-deleted nodes when retiring a type. */
  purge_deleted: z.boolean().optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type ManageTypeInput = z.infer<typeof ManageTypeInputSchema>;

export const ManageTypeSuccessSchema = z.object({
  type: NodeTypeSchema,
  activity_id: z.string().uuid(),
});

export const ManageRelationInputSchema = z.object({
  action: z.enum(["create", "update"]),
  slug: SlugSchema,
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  kind: RelationKindSchema.optional(),
  source_types: z.array(z.string()).optional(),
  target_types: z.array(z.string()).optional(),
  is_symmetric: z.boolean().optional(),
  semantic_parent_slug: z.string().nullable().optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type ManageRelationInput = z.infer<typeof ManageRelationInputSchema>;

export const ManageRelationSuccessSchema = z.object({
  relation: RelationTypeSchema,
  activity_id: z.string().uuid(),
});

export const IsoDateSchema = z.string().refine(isIsoDate, {
  message: "must be an ISO date YYYY-MM-DD",
});

export const SearchDueKindSchema = z.enum(["overdue", "today"]);

export const SearchInputSchema = z.object({
  /** Lexical query. Optional when a filter is set. */
  query: z.string().optional(),
  type: z.string().min(1).optional(),
  status: NodeStatusSchema.optional(),
  /** UUID of a live parent; lists nodes with child_of to that parent. */
  under: z.string().uuid().optional(),
  /** ISO-8601 timestamp; live nodes with updated_at >= since. */
  since: z.string().min(1).optional(),
  /** Unique origin ref lookup (gmail | calendar | drive | github). */
  origin: OriginRefSchema.optional(),
  /** Due before today, or due today, in America/New_York. */
  due: SearchDueKindSchema.optional(),
  /** Inclusive ISO date YYYY-MM-DD on data.due. */
  due_on_or_before: IsoDateSchema.optional(),
  /** Inclusive ISO date YYYY-MM-DD on data.due. */
  due_on_or_after: IsoDateSchema.optional(),
  /** Top-level data key equality (JSONB @>). One or a few keys, e.g. { kind, status }. */
  data_equals: DataEqualsSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type SearchInput = z.infer<typeof SearchInputSchema>;

export const SearchHitSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  status: NodeStatusSchema,
  snippet: z.string(),
  /** data.due when present (YYYY-MM-DD). */
  due: z.string().optional(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

/** Shown on an empty lexical miss so agents do not treat it as “create a new node”. */
export const SEARCH_MISS_SUGGESTION =
  "No lexical hits. Do not upsert a duplicate. If you already have a UUID, call get. Try a shorter token or a type filter; only upsert if this entity is new.";

export const SEARCH_UUID_SUGGESTION =
  "This query is a node UUID. Prefer get when you already have an id.";

export const SEARCH_NO_SELECTOR_SUGGESTION =
  "Pass query for lexical recall, or type, status, under (child_of parent UUID), since, origin, due (overdue|today), due_on_or_before, due_on_or_after, or data_equals to list without a word. Do not add list_nodes.";

export function searchHasSelector(input: {
  query?: string;
  type?: string;
  status?: string;
  under?: string;
  since?: string;
  origin?: unknown;
  due?: string;
  due_on_or_before?: string;
  due_on_or_after?: string;
  data_equals?: Record<string, string>;
}): boolean {
  return Boolean(
    input.query?.trim() ||
      input.type ||
      input.status ||
      input.under ||
      input.since ||
      input.origin ||
      input.due ||
      input.due_on_or_before ||
      input.due_on_or_after ||
      hasDataEqualsFilter(input.data_equals),
  );
}

export const ORIGIN_MISS_SUGGESTION =
  "No live node has that origin. You may upsert with data.origin.system and data.origin.id. Foundation stores the ref only — do not fetch or mirror Gmail, Calendar, Drive, or GitHub bodies.";

export const ORIGIN_HIT_SUGGESTION =
  "This origin is unique on live nodes. Prefer get with that id. Do not upsert a twin.";

export const SearchSuccessSchema = z.object({
  nodes: z.array(SearchHitSchema),
  suggestion: z.string().optional(),
});

export const LOOKUP_BATCH_MAX = 20;
export const LOOKUP_NAME_MAX = 200;
export const LOOKUP_CANDIDATE_MAX = 10;

export const LOOKUP_NO_SELECTOR_SUGGESTION =
  "Pass one or more inputs with name (max 20). Optional type narrows people, places, companies, or other types. Do not use lookup for listing, origin refs, or payload search — those stay on search.";

export const LookupMatchSchema = z.enum([
  "title_exact",
  "alias_exact",
  "title_fuzzy",
  "alias_fuzzy",
  "title_token",
  "uuid",
]);
export type LookupMatch = z.infer<typeof LookupMatchSchema>;

export const LookupOutcomeSchema = z.enum([
  "exact",
  "alias",
  "candidate",
  "ambiguous",
  "no_match",
]);
export type LookupOutcome = z.infer<typeof LookupOutcomeSchema>;

export const LookupInputItemSchema = z.object({
  name: z.string().trim().min(1).max(LOOKUP_NAME_MAX),
  type: z.string().min(1).optional(),
  id: z.string().trim().min(1).max(80).optional(),
});
export type LookupInputItem = z.infer<typeof LookupInputItemSchema>;

export const LookupInputSchema = z.object({
  inputs: z.array(LookupInputItemSchema).min(1).max(LOOKUP_BATCH_MAX),
  type: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(LOOKUP_CANDIDATE_MAX).optional(),
});
export type LookupInput = z.infer<typeof LookupInputSchema>;

export const LookupCandidateSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  /** Canonical node title (not the matched alias). */
  title: z.string().min(1),
  status: NodeStatusSchema,
  /** Current node timestamp for a later if-match upsert or link. */
  updated_at: z.string().min(1),
  /**
   * Algorithmic ranking in [0, 1]. Persist or show it. Not a calibrated
   * probability and it does not authorize a write.
   */
  confidence: z.number().min(0).max(1),
  match: LookupMatchSchema,
  matched_value: z.string().min(1),
  explanation: z.string().min(1),
});
export type LookupCandidate = z.infer<typeof LookupCandidateSchema>;

export const DUPLICATE_CANDIDATES_ERROR = "duplicate_candidates";

export const DuplicatePreflightErrorSchema = z.object({
  error: z.literal(DUPLICATE_CANDIDATES_ERROR),
  suggestion: z.string().min(1),
  outcome: z.enum(["exact", "alias", "ambiguous"]),
  candidates: z.array(LookupCandidateSchema),
});
export type DuplicatePreflightError = z.infer<typeof DuplicatePreflightErrorSchema>;

export const DuplicateWarningSchema = z.object({
  outcome: z.literal("candidate"),
  candidates: z.array(LookupCandidateSchema),
  suggestion: z.string().min(1),
});
export type DuplicateWarning = z.infer<typeof DuplicateWarningSchema>;

export const UpsertSuccessSchema = z.object({
  node: NodeSchema,
  activity_id: z.string().uuid(),
  /** Title-FTS proposals. Empty when none, including an empty graph. Never creates an edge. */
  suggested_links: z.array(SuggestedLinkSchema),
  /** Token/fuzzy/compact hits on create. The write still happened. */
  duplicate_warnings: DuplicateWarningSchema.optional(),
});
export type UpsertSuccess = z.infer<typeof UpsertSuccessSchema>;

export const LookupResultSchema = z.object({
  input: LookupInputItemSchema,
  outcome: LookupOutcomeSchema,
  candidates: z.array(LookupCandidateSchema),
  suggestion: z.string().optional(),
});
export type LookupResult = z.infer<typeof LookupResultSchema>;

export const LookupSuccessSchema = z.object({
  results: z.array(LookupResultSchema),
});
export type LookupSuccess = z.infer<typeof LookupSuccessSchema>;

export const ListActivityInputSchema = z.object({
  action: ActivityActionSchema.optional(),
  target: z.string().min(1).optional(),
  since: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type ListActivityInput = z.infer<typeof ListActivityInputSchema>;

export const ListActivitySuccessSchema = z.object({
  activities: z.array(ActivitySchema),
});

export const UndoInputSchema = z.object({
  id: z.string().uuid(),
  confirm: z.boolean().optional(),
  /** Permanently drop leftover soft-deleted nodes when undoing a type create. */
  purge_deleted: z.boolean().optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type UndoInput = z.infer<typeof UndoInputSchema>;
