import { resolveTypeViews, type NodeType, type RelationType, type ViewEngineId } from "@foundation/schema";
import type pg from "pg";
import { iso, type Queryable } from "./tx.js";

type NodeTypeRow = {
  slug: string;
  label: string;
  description: string;
  kind: NodeType["kind"];
  parent_types: string[];
  json_schema: unknown;
  views: string[];
  default_view: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapNodeType(row: NodeTypeRow): NodeType {
  const resolved = resolveTypeViews({ views: row.views, default_view: row.default_view });
  return {
    slug: row.slug,
    label: row.label,
    description: row.description,
    kind: row.kind,
    parent_types: row.parent_types,
    json_schema: row.json_schema,
    views: resolved.views ?? [],
    ...(resolved.defaultView ? { default_view: resolved.defaultView } : {}),
    is_system: row.is_system,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

type RelationTypeRow = {
  slug: string;
  label: string;
  description: string;
  kind: RelationType["kind"];
  source_types: string[];
  target_types: string[];
  is_symmetric: boolean;
  semantic_parent_slug: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapRelationType(row: RelationTypeRow): RelationType {
  return {
    slug: row.slug,
    label: row.label,
    description: row.description,
    kind: row.kind,
    source_types: row.source_types,
    target_types: row.target_types,
    is_symmetric: row.is_symmetric,
    semantic_parent_slug: row.semantic_parent_slug,
    is_system: row.is_system,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export async function listNodeTypes(db: Queryable): Promise<NodeType[]> {
  const { rows } = await db.query<NodeTypeRow>(
    `
    SELECT slug, label, description, kind, parent_types, json_schema, views, default_view,
           is_system, created_at, updated_at
    FROM node_types
    ORDER BY kind DESC, slug
    `,
  );
  return rows.map(mapNodeType);
}

export async function getNodeType(db: Queryable, slug: string): Promise<NodeType | undefined> {
  const { rows } = await db.query<NodeTypeRow>(
    `SELECT slug, label, description, kind, parent_types, json_schema, views, default_view,
            is_system, created_at, updated_at
     FROM node_types WHERE slug = $1`,
    [slug],
  );
  return rows[0] ? mapNodeType(rows[0]) : undefined;
}

export async function insertNodeType(
  db: Queryable,
  type: {
    slug: string;
    label: string;
    description: string;
    kind: NodeType["kind"];
    parent_types: string[];
    json_schema: unknown;
    views?: ViewEngineId[];
    default_view?: ViewEngineId;
  },
): Promise<NodeType> {
  const views = type.views ?? [];
  const defaultView = views.length === 0 ? null : (type.default_view ?? null);
  const { rows } = await db.query<NodeTypeRow>(
    `INSERT INTO node_types (
       slug, label, description, kind, parent_types, json_schema, views, default_view, is_system
     ) VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7::text[], $8, false)
     RETURNING slug, label, description, kind, parent_types, json_schema, views, default_view,
               is_system, created_at, updated_at`,
    [
      type.slug,
      type.label,
      type.description,
      type.kind,
      type.parent_types,
      type.json_schema === null || type.json_schema === undefined
        ? null
        : JSON.stringify(type.json_schema),
      views,
      defaultView,
    ],
  );
  return mapNodeType(rows[0]!);
}

export async function updateNodeType(
  db: Queryable,
  slug: string,
  patch: {
    label: string;
    description: string;
    kind: NodeType["kind"];
    parent_types: string[];
    json_schema: unknown;
    views: ViewEngineId[];
    default_view?: ViewEngineId;
  },
): Promise<NodeType | undefined> {
  const defaultView = patch.views.length === 0 ? null : (patch.default_view ?? null);
  const { rows } = await db.query<NodeTypeRow>(
    `UPDATE node_types SET
       label = $2,
       description = $3,
       kind = $4,
       parent_types = $5::text[],
       json_schema = $6::jsonb,
       views = $7::text[],
       default_view = $8,
       updated_at = now()
     WHERE slug = $1
     RETURNING slug, label, description, kind, parent_types, json_schema, views, default_view,
               is_system, created_at, updated_at`,
    [
      slug,
      patch.label,
      patch.description,
      patch.kind,
      patch.parent_types,
      patch.json_schema === null || patch.json_schema === undefined
        ? null
        : JSON.stringify(patch.json_schema),
      patch.views,
      defaultView,
    ],
  );
  return rows[0] ? mapNodeType(rows[0]) : undefined;
}

export async function updateNodeTypeDescription(
  db: Queryable,
  slug: string,
  description: string,
): Promise<NodeType | undefined> {
  const { rows } = await db.query<NodeTypeRow>(
    `UPDATE node_types SET description = $2, updated_at = now()
     WHERE slug = $1
     RETURNING slug, label, description, kind, parent_types, json_schema, views, default_view,
               is_system, created_at, updated_at`,
    [slug, description],
  );
  return rows[0] ? mapNodeType(rows[0]) : undefined;
}

export async function listRelationTypes(db: Queryable): Promise<RelationType[]> {
  const { rows } = await db.query<RelationTypeRow>(
    `
    SELECT slug, label, description, kind, source_types, target_types,
           is_symmetric, semantic_parent_slug, is_system, created_at, updated_at
    FROM relation_types
    ORDER BY kind DESC, slug
    `,
  );
  return rows.map(mapRelationType);
}

export async function getRelationType(
  db: Queryable,
  slug: string,
): Promise<RelationType | undefined> {
  const { rows } = await db.query<RelationTypeRow>(
    `SELECT slug, label, description, kind, source_types, target_types,
            is_symmetric, semantic_parent_slug, is_system, created_at, updated_at
     FROM relation_types WHERE slug = $1`,
    [slug],
  );
  return rows[0] ? mapRelationType(rows[0]) : undefined;
}

export async function insertRelationType(
  db: Queryable,
  relation: {
    slug: string;
    label: string;
    description: string;
    kind: RelationType["kind"];
    source_types: string[];
    target_types: string[];
    is_symmetric: boolean;
    semantic_parent_slug: string | null;
  },
): Promise<RelationType> {
  const { rows } = await db.query<RelationTypeRow>(
    `INSERT INTO relation_types (
       slug, label, description, kind, source_types, target_types,
       is_symmetric, semantic_parent_slug, is_system
     ) VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, false)
     RETURNING slug, label, description, kind, source_types, target_types,
               is_symmetric, semantic_parent_slug, is_system, created_at, updated_at`,
    [
      relation.slug,
      relation.label,
      relation.description,
      relation.kind,
      relation.source_types,
      relation.target_types,
      relation.is_symmetric,
      relation.semantic_parent_slug,
    ],
  );
  return mapRelationType(rows[0]!);
}

export async function updateRelationType(
  db: Queryable,
  slug: string,
  patch: {
    label: string;
    description: string;
    kind: RelationType["kind"];
    source_types: string[];
    target_types: string[];
    is_symmetric: boolean;
    semantic_parent_slug: string | null;
  },
): Promise<RelationType | undefined> {
  const { rows } = await db.query<RelationTypeRow>(
    `UPDATE relation_types SET
       label = $2,
       description = $3,
       kind = $4,
       source_types = $5::text[],
       target_types = $6::text[],
       is_symmetric = $7,
       semantic_parent_slug = $8,
       updated_at = now()
     WHERE slug = $1
     RETURNING slug, label, description, kind, source_types, target_types,
               is_symmetric, semantic_parent_slug, is_system, created_at, updated_at`,
    [
      slug,
      patch.label,
      patch.description,
      patch.kind,
      patch.source_types,
      patch.target_types,
      patch.is_symmetric,
      patch.semantic_parent_slug,
    ],
  );
  return rows[0] ? mapRelationType(rows[0]) : undefined;
}

export async function updateRelationTypeDescription(
  db: Queryable,
  slug: string,
  description: string,
): Promise<RelationType | undefined> {
  const { rows } = await db.query<RelationTypeRow>(
    `UPDATE relation_types SET description = $2, updated_at = now()
     WHERE slug = $1
     RETURNING slug, label, description, kind, source_types, target_types,
               is_symmetric, semantic_parent_slug, is_system, created_at, updated_at`,
    [slug, description],
  );
  return rows[0] ? mapRelationType(rows[0]) : undefined;
}

export async function pingDb(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function countLiveNodesGroupedByType(
  db: Queryable,
): Promise<Map<string, number>> {
  const { rows } = await db.query<{ type: string; n: string }>(
    `SELECT type, COUNT(*)::text AS n FROM nodes WHERE deleted_at IS NULL GROUP BY type`,
  );
  return new Map(rows.map((row) => [row.type, Number(row.n)]));
}

export async function countNodesByType(db: Queryable, slug: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM nodes WHERE type = $1 AND deleted_at IS NULL`,
    [slug],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countDeletedNodesByType(db: Queryable, slug: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM nodes WHERE type = $1 AND deleted_at IS NOT NULL`,
    [slug],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countTypesUsingParent(db: Queryable, slug: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM node_types WHERE $1 = ANY(parent_types)`,
    [slug],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countEdgesByRelation(db: Queryable, slug: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM edges WHERE relation_type = $1`,
    [slug],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function countRelationsUsingSemanticParent(
  db: Queryable,
  slug: string,
): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM relation_types WHERE semantic_parent_slug = $1`,
    [slug],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function deleteNodeType(db: Queryable, slug: string): Promise<NodeType | undefined> {
  const { rows } = await db.query<NodeTypeRow>(
    `DELETE FROM node_types
     WHERE slug = $1 AND is_system = false
     RETURNING slug, label, description, kind, parent_types, json_schema, is_system,
               created_at, updated_at`,
    [slug],
  );
  return rows[0] ? mapNodeType(rows[0]) : undefined;
}

export async function deleteRelationType(
  db: Queryable,
  slug: string,
): Promise<RelationType | undefined> {
  const { rows } = await db.query<RelationTypeRow>(
    `DELETE FROM relation_types
     WHERE slug = $1 AND is_system = false
     RETURNING slug, label, description, kind, source_types, target_types,
               is_symmetric, semantic_parent_slug, is_system, created_at, updated_at`,
    [slug],
  );
  return rows[0] ? mapRelationType(rows[0]) : undefined;
}
