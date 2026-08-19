import {
  compileJsonSchemaFromFields,
  mergeMissingFields,
  mergeMissingViewIds,
  SEED_NODE_TYPES,
  SEED_RELATION_TYPES,
  asViewDeclarations,
} from "@foundation/schema";
import type pg from "pg";
import { getNodeType, insertNodeType, updateNodeType } from "./queries.js";

export async function seedSystemOntology(pool: pg.Pool): Promise<void> {
  for (const type of SEED_NODE_TYPES) {
    const existing = await getNodeType(pool, type.slug);
    if (!existing) {
      await insertNodeType(pool, {
        slug: type.slug,
        label: type.label,
        description: type.description,
        kind: type.kind,
        parent_types: type.parent_types,
        json_schema: type.json_schema,
        views: asViewDeclarations(type.views),
        default_view: type.default_view,
        fields: type.fields ?? [],
        is_system: true,
      });
      continue;
    }
    const fields = mergeMissingFields(existing.fields ?? [], type.fields ?? []);
    const views = mergeMissingViewIds(
      asViewDeclarations(existing.views),
      asViewDeclarations(type.views),
    );
    const compiled = compileJsonSchemaFromFields(fields);
    const jsonSchema =
      fields.length > 0 ? compiled : existing.is_system ? existing.json_schema : type.json_schema;
    await updateNodeType(pool, type.slug, {
      label: type.label,
      description: existing.is_system ? existing.description : type.description,
      kind: type.kind,
      parent_types: type.parent_types,
      json_schema: jsonSchema,
      views,
      default_view: existing.default_view ?? type.default_view,
      fields,
    });
    await pool.query(`UPDATE node_types SET is_system = true, updated_at = now() WHERE slug = $1`, [
      type.slug,
    ]);
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
