import { z } from "zod";

export const NodeStatusSchema = z.enum(["active", "completed", "archived"]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const PayloadStorageSchema = z.enum(["inline", "blob"]);
export type PayloadStorage = z.infer<typeof PayloadStorageSchema>;

export const PayloadSchema = z
  .object({
    media_type: z.string().min(1),
    storage: PayloadStorageSchema,
    body: z.string().optional(),
    blob_id: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.storage === "inline" && value.body === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "inline payload requires body",
        path: ["body"],
      });
    }
    if (value.storage === "blob" && value.blob_id === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "blob payload requires blob_id",
        path: ["blob_id"],
      });
    }
  });
export type Payload = z.infer<typeof PayloadSchema>;

export const JsonObjectSchema = z.record(z.unknown());
export type JsonObject = z.infer<typeof JsonObjectSchema>;

export const NodeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  title: z.string().min(1),
  status: NodeStatusSchema,
  payload: PayloadSchema,
  data: JsonObjectSchema,
  metadata: JsonObjectSchema,
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  id: z.string().uuid(),
  from_id: z.string().uuid(),
  to_id: z.string().uuid(),
  relation_type: z.string().min(1),
  metadata: JsonObjectSchema,
  created_at: z.string(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const TypeKindSchema = z.enum(["spine", "artifact"]);
export type TypeKind = z.infer<typeof TypeKindSchema>;

export const NodeTypeSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  kind: TypeKindSchema,
  parent_types: z.array(z.string()),
  json_schema: z.unknown().nullable(),
  is_system: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const RelationKindSchema = z.enum(["hierarchy", "associative"]);
export type RelationKind = z.infer<typeof RelationKindSchema>;

export const RelationTypeSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  kind: RelationKindSchema,
  source_types: z.array(z.string()),
  target_types: z.array(z.string()),
  is_symmetric: z.boolean(),
  semantic_parent_slug: z.string().nullable(),
  is_system: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const ActivityActorSchema = z.enum(["agent", "user", "system"]);
export const ActivityActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "restore",
  "link",
  "unlink",
  "type_change",
  "relation_change",
]);
export const ActivityTargetKindSchema = z.enum(["node", "edge", "type", "relation"]);

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  actor: ActivityActorSchema,
  actor_label: z.string().nullable(),
  action: ActivityActionSchema,
  target_kind: ActivityTargetKindSchema,
  target_id: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reversible: z.boolean(),
  undo_token: z.string().uuid().nullable(),
  token_expires_at: z.string().nullable(),
  undone_at: z.string().nullable(),
  rationale: z.string().nullable(),
  created_at: z.string(),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const BlobSchema = z.object({
  id: z.string().uuid(),
  media_type: z.string().min(1),
  byte_size: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  path: z.string().min(1),
  created_at: z.string(),
});
export type Blob = z.infer<typeof BlobSchema>;

export const BootstrapOutputSchema = z.object({
  spine: z.object({
    diagram: z.string(),
    root: z.literal("area"),
    description: z.string(),
  }),
  types: z.array(NodeTypeSchema),
  relations: z.array(RelationTypeSchema),
  rules: z.object({
    identity: z.literal("uuid"),
    payloads: z.string(),
    destructive_confirm: z.literal(true),
    ontology_writable: z.literal(true),
    no_proposal_inbox: z.literal(true),
    edges_are_source_of_truth: z.literal(true),
    hierarchy_relation: z.literal("child_of"),
  }),
  how_to_extend: z.object({
    summary: z.string(),
    manage_type: z.string(),
    manage_relation: z.string(),
    nodes: z.string(),
    links: z.string(),
  }),
});
export type BootstrapOutput = z.infer<typeof BootstrapOutputSchema>;
