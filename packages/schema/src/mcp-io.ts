import { z } from "zod";
import {
  ActivityActionSchema,
  ActivitySchema,
  EdgeSchema,
  JsonObjectSchema,
  NodeSchema,
  NodeStatusSchema,
  NodeTypeSchema,
  PayloadSchema,
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
});

export const IncidentEdgeSchema = EdgeSchema.extend({
  direction: z.enum(["in", "out"]),
});
export type IncidentEdge = z.infer<typeof IncidentEdgeSchema>;

export const GetSuccessSchema = z.object({
  node: NodeSchema,
  edges: z.array(IncidentEdgeSchema),
});

export const UpsertInputSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.string().min(1),
  title: z.string().min(1),
  payload: PayloadSchema.optional(),
  data: JsonObjectSchema.optional(),
  status: NodeStatusSchema.optional(),
  metadata: JsonObjectSchema.optional(),
});
export type UpsertInput = z.infer<typeof UpsertInputSchema>;

export const UpsertSuccessSchema = z.object({
  node: NodeSchema,
  activity_id: z.string().uuid(),
});

export const DeleteInputSchema = z.object({
  id: z.string().uuid(),
  confirm: z.boolean().optional(),
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
});
export type ManageRelationInput = z.infer<typeof ManageRelationInputSchema>;

export const ManageRelationSuccessSchema = z.object({
  relation: RelationTypeSchema,
  activity_id: z.string().uuid(),
});

export const SearchInputSchema = z.object({
  query: z.string().trim().min(1),
  type: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type SearchInput = z.infer<typeof SearchInputSchema>;

export const SearchSuccessSchema = z.object({
  nodes: z.array(NodeSchema),
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
});
export type UndoInput = z.infer<typeof UndoInputSchema>;
