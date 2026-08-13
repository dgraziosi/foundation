import type { NodeType, RelationType } from "@foundation/schema";
import type pg from "pg";

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function listNodeTypes(pool: pg.Pool): Promise<NodeType[]> {
  const { rows } = await pool.query<{
    slug: string;
    label: string;
    description: string;
    kind: NodeType["kind"];
    parent_types: string[];
    json_schema: unknown;
    is_system: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT slug, label, description, kind, parent_types, json_schema, is_system,
           created_at, updated_at
    FROM node_types
    ORDER BY kind DESC, slug
    `,
  );

  return rows.map((row) => ({
    slug: row.slug,
    label: row.label,
    description: row.description,
    kind: row.kind,
    parent_types: row.parent_types,
    json_schema: row.json_schema,
    is_system: row.is_system,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }));
}

export async function listRelationTypes(pool: pg.Pool): Promise<RelationType[]> {
  const { rows } = await pool.query<{
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
  }>(
    `
    SELECT slug, label, description, kind, source_types, target_types,
           is_symmetric, semantic_parent_slug, is_system, created_at, updated_at
    FROM relation_types
    ORDER BY kind DESC, slug
    `,
  );

  return rows.map((row) => ({
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
  }));
}

export async function pingDb(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
