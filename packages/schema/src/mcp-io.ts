import { z } from "zod";
import { BLOB_BASE64_MAX_CHARS } from "./blobs.js";
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
} from "./types.js";

export const ToolErrorSchema = z.object({
  error: z.string(),
  suggestion: z.string().optional(),
});
export type ToolError = z.infer<typeof ToolErrorSchema>;

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
  return Object.keys(value).every((key) => key === "error" || key === "suggestion");
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

export const GetSuccessSchema = z.object({
  node: NodeSchema,
  edges: z.array(IncidentEdgeSchema),
  blob: BlobSchema.optional(),
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
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type UpsertInput = z.infer<typeof UpsertInputSchema>;

export const UpsertSuccessSchema = z.object({
  node: NodeSchema,
  activity_id: z.string().uuid(),
});

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

export const LinkInputSchema = z.object({
  from_id: z.string().uuid(),
  to_id: z.string().uuid(),
  relation_type: z.string().min(1),
  upgrade: z.boolean().optional(),
  metadata: JsonObjectSchema.optional(),
  /** Required: `from` node's `updated_at` from get. */
  from_base_updated_at: z.string().min(1).optional(),
  /** Required: `to` node's `updated_at` from get. */
  to_base_updated_at: z.string().min(1).optional(),
  actor: ActivityActorSchema.optional(),
  actor_label: z.string().trim().min(1).max(200).optional(),
});
export type LinkInput = z.infer<typeof LinkInputSchema>;

export const LinkSuccessSchema = z.object({
  edge: EdgeSchema,
  activity_id: z.string().uuid(),
  suggestion: z.string().optional(),
});

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
  action: z.enum(["create", "update"]),
  slug: SlugSchema,
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  kind: TypeKindSchema.optional(),
  parent_types: z.array(z.string()).optional(),
  json_schema: z.unknown().nullable().optional(),
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

export const SearchInputSchema = z.object({
  /** Lexical query. Optional when type, status, under, since, or origin is set. */
  query: z.string().optional(),
  type: z.string().min(1).optional(),
  status: NodeStatusSchema.optional(),
  /** UUID of a live parent; lists nodes with child_of to that parent. */
  under: z.string().uuid().optional(),
  /** ISO-8601 timestamp; live nodes with updated_at >= since. */
  since: z.string().min(1).optional(),
  /** Unique origin ref lookup (gmail | calendar | drive | github). */
  origin: OriginRefSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type SearchInput = z.infer<typeof SearchInputSchema>;

export const SearchHitSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  status: NodeStatusSchema,
  snippet: z.string(),
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

/** Shown on an empty lexical miss so agents do not treat it as “create a new node”. */
export const SEARCH_MISS_SUGGESTION =
  "No lexical hits. Do not upsert a duplicate. If you already have a UUID, call get. Try a shorter token or a type filter; only upsert if this entity is new.";

export const SEARCH_UUID_SUGGESTION =
  "This query is a node UUID. Prefer get when you already have an id.";

export const SEARCH_NO_SELECTOR_SUGGESTION =
  "Pass query for lexical recall, or type, status, under (child_of parent UUID), since, or origin to list without a word. Do not add list_nodes.";

export const ORIGIN_MISS_SUGGESTION =
  "No live node has that origin. You may upsert with data.origin.system and data.origin.id. Foundation stores the ref only — do not fetch or mirror Gmail, Calendar, Drive, or GitHub bodies.";

export const ORIGIN_HIT_SUGGESTION =
  "This origin is unique on live nodes. Prefer get with that id. Do not upsert a twin.";

export const SearchSuccessSchema = z.object({
  nodes: z.array(SearchHitSchema),
  suggestion: z.string().optional(),
});

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
