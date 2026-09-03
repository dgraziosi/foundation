import { z } from "zod";
import { FIELD_KINDS, FIELD_ROLES } from "./fields.js";
import { TypeGlyphSchema, TypeHueSchema } from "./type-identity.js";
import { asViewDeclarations, VIEW_BINDS, VIEW_ENGINE_IDS } from "./views.js";

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

/** Drive, Gmail, or Calendar object. Not GitHub. Not a blob. Search `{ url }`. */
export const URL_IDENTITY_SYSTEMS = ["gmail", "calendar", "drive"] as const;
export type UrlIdentitySystem = (typeof URL_IDENTITY_SYSTEMS)[number];

export const UrlIdentitySystemSchema = z.enum(URL_IDENTITY_SYSTEMS);
export const UrlIdentitySchema = z.object({
  system: UrlIdentitySystemSchema,
  id: z.string().trim().min(1),
});
export type UrlIdentity = z.infer<typeof UrlIdentitySchema>;

/** GitHub object. Not Gmail, Calendar, or Drive. Not Cursor Origin. */
export const REPO_SYSTEMS = ["github"] as const;
export type RepoSystem = (typeof REPO_SYSTEMS)[number];

export const RepoSystemSchema = z.enum(REPO_SYSTEMS);
export const RepoRefSchema = z.object({
  system: RepoSystemSchema,
  id: z.string().trim().min(1),
});
export type RepoRef = z.infer<typeof RepoRefSchema>;

/** Mail sent or calendar event gone. Store the ref only — never fetch or mirror bodies. */
export const RECEIPT_SYSTEMS = ["gmail", "calendar"] as const;
export type ReceiptSystem = (typeof RECEIPT_SYSTEMS)[number];

export const RECEIPT_KINDS = ["sent", "cleared"] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

export const ReceiptSystemSchema = z.enum(RECEIPT_SYSTEMS);
export const ReceiptKindSchema = z.enum(RECEIPT_KINDS);
export const ReceiptRefSchema = z.object({
  system: ReceiptSystemSchema,
  id: z.string().trim().min(1),
  kind: ReceiptKindSchema,
});
export type ReceiptRef = z.infer<typeof ReceiptRefSchema>;

/** Unique live receipt lookup — system and id only. Kind lives on the stored node. */
export const ReceiptLookupSchema = z.object({
  system: ReceiptSystemSchema,
  id: z.string().trim().min(1),
});
export type ReceiptLookup = z.infer<typeof ReceiptLookupSchema>;

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

export const ViewEngineIdSchema = z.enum(VIEW_ENGINE_IDS);
export const ViewBindSchema = z.enum(VIEW_BINDS);

export const ViewDeclarationSchema = z.object({
  id: ViewEngineIdSchema,
  filter: z
    .object({
      clauses: z.array(
        z.object({
          bind: ViewBindSchema,
          op: z.enum(["eq", "in"]),
          value: z.union([z.string(), z.array(z.string())]),
        }),
      ),
    })
    .optional(),
  sort: z
    .array(
      z.object({
        bind: ViewBindSchema,
        dir: z.enum(["asc", "desc"]),
      }),
    )
    .optional(),
  group: z.object({ bind: ViewBindSchema }).optional(),
});

export const TypeFieldSchema = z.object({
  name: z.string().min(1),
  display: z.string(),
  kind: z.enum(FIELD_KINDS),
  needed: z.boolean(),
  role: z.enum(FIELD_ROLES).optional(),
  enum_values: z.array(z.string()).optional(),
  ref_type: z.string().optional(),
});

export const NodeTypeSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  kind: TypeKindSchema,
  parent_types: z.array(z.string()),
  json_schema: z.unknown().nullable(),
  views: z
    .array(z.union([ViewEngineIdSchema, ViewDeclarationSchema]))
    .optional()
    .transform((views) => (views === undefined ? undefined : asViewDeclarations(views))),
  default_view: ViewEngineIdSchema.optional(),
  fields: z.array(TypeFieldSchema).optional(),
  hue: TypeHueSchema.optional(),
  glyph: TypeGlyphSchema.optional(),
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
    destructive_scope: z.boolean(),
    actor_label: z.string(),
    ontology_writable: z.literal(true),
    no_proposal_inbox: z.literal(true),
    edges_are_source_of_truth: z.literal(true),
    hierarchy_relation: z.string().min(1),
  }),
  how_to_extend: z.object({
    summary: z.string(),
    manage_type: z.string(),
    manage_relation: z.string(),
    nodes: z.string(),
    links: z.string(),
    activity: z.string(),
    search: z.string(),
    lookup: z.string(),
    working_set: z.string(),
  }),
});
export type BootstrapOutput = z.infer<typeof BootstrapOutputSchema>;
