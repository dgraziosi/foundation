import type { TypeField } from "./fields.js";
import type { NodeType, RelationType } from "./types.js";
import { toolError, type ToolError } from "./mcp-io.js";
import {
  mergeTypeViewsPatch,
  parseTypeViewsInput,
  sameViewIds,
  viewIds,
  type ViewDeclaration,
  type ViewEngineId,
} from "./views.js";

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function labelFromSlug(slug: string): string {
  return slug.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

/**
 * System types: description, fields, and filter/sort/group on already-declared
 * views. The ordered view id list stays locked. Slug identity stays locked.
 */
export function assertSystemTypePatch(
  existing: NodeType,
  patch: {
    slug?: string;
    label?: string;
    kind?: NodeType["kind"];
    parent_types?: string[];
    json_schema?: unknown;
    views?: readonly (string | ViewDeclaration)[];
    default_view?: ViewEngineId;
    fields?: TypeField[];
  },
): ToolError | null {
  if (!existing.is_system) {
    return null;
  }
  const changed: string[] = [];
  if (patch.slug !== undefined && patch.slug !== existing.slug) {
    changed.push("slug");
  }
  if (patch.label !== undefined && patch.label !== existing.label) {
    changed.push("label");
  }
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    changed.push("kind");
  }
  if (patch.parent_types !== undefined && !sameJson(patch.parent_types, existing.parent_types)) {
    changed.push("parent_types");
  }
  if (patch.json_schema !== undefined && !sameJson(patch.json_schema, existing.json_schema)) {
    changed.push("json_schema");
  }
  if (patch.views !== undefined && !sameViewIds(existing.views, patch.views)) {
    changed.push("views");
  }
  if (patch.default_view !== undefined) {
    const lockedIds = viewIds(existing.views);
    if (!lockedIds.includes(patch.default_view)) {
      changed.push("default_view");
    }
  }
  if (changed.length === 0) {
    return null;
  }
  return toolError(
    `Cannot change system type "${existing.slug}" fields: ${changed.join(", ")}`,
    "System types may edit description, fields, and filter/sort/group on views they already declare. The ordered view id list, slug, kind, parent_types, and label stay locked. default_view stays a member of those ids.",
  );
}

export function assertSystemRelationPatch(
  existing: RelationType,
  patch: {
    label?: string;
    kind?: RelationType["kind"];
    source_types?: string[];
    target_types?: string[];
    is_symmetric?: boolean;
    semantic_parent_slug?: string | null;
  },
): ToolError | null {
  if (!existing.is_system) {
    return null;
  }
  const changed: string[] = [];
  if (patch.label !== undefined && patch.label !== existing.label) {
    changed.push("label");
  }
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    changed.push("kind");
  }
  if (patch.source_types !== undefined && !sameJson(patch.source_types, existing.source_types)) {
    changed.push("source_types");
  }
  if (patch.target_types !== undefined && !sameJson(patch.target_types, existing.target_types)) {
    changed.push("target_types");
  }
  if (patch.is_symmetric !== undefined && patch.is_symmetric !== existing.is_symmetric) {
    changed.push("is_symmetric");
  }
  if (
    patch.semantic_parent_slug !== undefined &&
    patch.semantic_parent_slug !== existing.semantic_parent_slug
  ) {
    changed.push("semantic_parent_slug");
  }
  if (changed.length === 0) {
    return null;
  }
  return toolError(
    `Cannot change system relation "${existing.slug}" fields: ${changed.join(", ")}`,
    "System relations may only have their description updated. Add a new relation with manage_relation action create instead.",
  );
}

export function typeViewsFromInput(input: {
  views?: unknown;
  default_view?: unknown;
}): { views: ViewDeclaration[]; default_view?: ViewEngineId } | ToolError {
  const parsed = parseTypeViewsInput(input);
  if (!parsed.ok) {
    return toolError(parsed.error, parsed.suggestion);
  }
  return { views: parsed.views, ...(parsed.default_view ? { default_view: parsed.default_view } : {}) };
}

export function typeViewsFromUpdate(
  existing: {
    views?: readonly (string | ViewDeclaration)[] | null;
    default_view?: string | null;
  },
  patch: { views?: unknown; default_view?: unknown },
): { views: ViewDeclaration[]; default_view?: ViewEngineId } | ToolError {
  const parsed = mergeTypeViewsPatch(existing, patch);
  if (!parsed.ok) {
    return toolError(parsed.error, parsed.suggestion);
  }
  return { views: parsed.views, ...(parsed.default_view ? { default_view: parsed.default_view } : {}) };
}

export function missingConfirm(tool: string, confirm: boolean | undefined): ToolError | null {
  if (confirm === true) {
    return null;
  }
  return toolError(`${tool} requires confirm: true`, `Retry ${tool} with confirm: true.`);
}
