import { SEED_NODE_TYPES, SEED_RELATION_TYPES } from "@foundation/schema";
import type pg from "pg";

export async function seedSystemOntology(pool: pg.Pool): Promise<void> {
  for (const type of SEED_NODE_TYPES) {
    await pool.query(
      `
      INSERT INTO node_types (
        slug, label, description, kind, parent_types, json_schema, is_system
      ) VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, true)
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        kind = EXCLUDED.kind,
        parent_types = EXCLUDED.parent_types,
        json_schema = EXCLUDED.json_schema,
        is_system = true,
        updated_at = now()
      `,
      [
        type.slug,
        type.label,
        type.description,
        type.kind,
        type.parent_types,
        type.json_schema === null ? null : JSON.stringify(type.json_schema),
      ],
    );
  }

  for (const relation of SEED_RELATION_TYPES) {
    await pool.query(
      `
      INSERT INTO relation_types (
        slug, label, description, kind, source_types, target_types,
        is_symmetric, semantic_parent_slug, is_system
      ) VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, NULL, true)
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        kind = EXCLUDED.kind,
        source_types = EXCLUDED.source_types,
        target_types = EXCLUDED.target_types,
        is_symmetric = EXCLUDED.is_symmetric,
        updated_at = now()
      WHERE relation_types.is_system = true
      `,
      [
        relation.slug,
        relation.label,
        relation.description,
        relation.kind,
        relation.source_types,
        relation.target_types,
        relation.is_symmetric,
      ],
    );
  }

  for (const relation of SEED_RELATION_TYPES) {
    if (!relation.semantic_parent_slug) {
      continue;
    }
    await pool.query(
      `
      UPDATE relation_types
      SET semantic_parent_slug = $2, updated_at = now()
      WHERE slug = $1 AND is_system = true
      `,
      [relation.slug, relation.semantic_parent_slug],
    );
  }
}
