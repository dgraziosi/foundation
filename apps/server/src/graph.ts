import {
  deleteEdge,
  findEdge,
  getNodeById,
  getNodeType,
  getRelationType,
  insertActivity,
  insertEdge,
  insertNode,
  insertNodeType,
  insertRelationType,
  listEdgesTouching,
  listIncidentEdges,
  listNodeTypes,
  listRelationTypes,
  softDeleteNode,
  updateNode,
  updateNodeType,
  updateNodeTypeDescription,
  updateRelationType,
  updateRelationTypeDescription,
  withTransaction,
  type Pool,
} from "@foundation/db";
import {
  DEFAULT_PAYLOAD,
  assertSystemRelationPatch,
  assertSystemTypePatch,
  labelFromSlug,
  missingConfirm,
  toolError,
  validateInlinePayload,
  validateLink,
  type Edge,
  type IncidentEdge,
  type LinkInput,
  type ManageRelationInput,
  type ManageTypeInput,
  type Node,
  type NodeType,
  type RelationType,
  type ToolError,
  type UpsertInput,
} from "@foundation/schema";
import { randomUUID } from "node:crypto";

async function knownTypeSlugs(pool: Pool): Promise<string> {
  const types = await listNodeTypes(pool);
  return types.map((type) => type.slug).join(", ");
}

async function knownRelationSlugs(pool: Pool): Promise<string> {
  const relations = await listRelationTypes(pool);
  return relations.map((type) => type.slug).join(", ");
}

async function assertTypeSlugsExist(
  pool: Pool,
  slugs: string[],
  field: string,
): Promise<ToolError | null> {
  for (const slug of slugs) {
    const type = await getNodeType(pool, slug);
    if (!type) {
      return toolError(
        `Unknown type "${slug}" in ${field}`,
        `Call inspect_ontology. Known types: ${await knownTypeSlugs(pool)}`,
      );
    }
  }
  return null;
}

export async function getGraphNode(
  pool: Pool,
  id: string,
): Promise<{ node: Node; edges: IncidentEdge[] } | ToolError> {
  const node = await getNodeById(pool, id);
  if (!node) {
    return toolError(
      `Node not found: ${id}`,
      "Use a live node UUID from upsert. Deleted nodes are hidden until undo (slice 7).",
    );
  }
  const edges = await listIncidentEdges(pool, id);
  return { node, edges };
}

export async function upsertGraphNode(
  pool: Pool,
  input: UpsertInput,
): Promise<{ node: Node; activity_id: string } | ToolError> {
  const type = await getNodeType(pool, input.type);
  if (!type) {
    return toolError(
      `Unknown type "${input.type}"`,
      `Call inspect_ontology or bootstrap, or manage_type to add it. Known types: ${await knownTypeSlugs(pool)}`,
    );
  }
  if (input.payload) {
    const payloadErr = validateInlinePayload(input.payload);
    if (payloadErr) {
      return payloadErr;
    }
  }

  return withTransaction(pool, async (client) => {
    if (input.id) {
      const existing = await getNodeById(client, input.id, { includeDeleted: true });
      if (existing?.deleted_at) {
        return toolError(
          `Node ${input.id} is deleted`,
          "Restore via undo (slice 7). Use a new id to create another node.",
        );
      }
      if (existing) {
        const node = await updateNode(client, input.id, {
          type: input.type,
          title: input.title,
          status: input.status,
          payload: input.payload,
          data: input.data,
          metadata: input.metadata,
        });
        if (!node) {
          return toolError(`Node not found: ${input.id}`);
        }
        const activity = await insertActivity(client, {
          action: "update",
          target_kind: "node",
          target_id: node.id,
          before: existing,
          after: node,
        });
        return { node, activity_id: activity.id };
      }
    }

    const node = await insertNode(client, {
      id: input.id ?? randomUUID(),
      type: input.type,
      title: input.title,
      status: input.status ?? "active",
      payload: input.payload ?? DEFAULT_PAYLOAD,
      data: input.data ?? {},
      metadata: input.metadata ?? {},
    });
    const activity = await insertActivity(client, {
      action: "create",
      target_kind: "node",
      target_id: node.id,
      before: null,
      after: node,
    });
    return { node, activity_id: activity.id };
  });
}

export async function deleteGraphNode(
  pool: Pool,
  input: { id: string; confirm?: boolean },
): Promise<{ ok: true; activity_id: string } | ToolError> {
  const confirmErr = missingConfirm("delete", input.confirm);
  if (confirmErr) {
    return confirmErr;
  }
  return withTransaction(pool, async (client) => {
    const before = await getNodeById(client, input.id);
    if (!before) {
      return toolError(
        `Node not found: ${input.id}`,
        "delete only soft-deletes a live node. Check the UUID from upsert.",
      );
    }
    const after = await softDeleteNode(client, input.id);
    if (!after) {
      return toolError(`Node not found: ${input.id}`);
    }
    const activity = await insertActivity(client, {
      action: "delete",
      target_kind: "node",
      target_id: after.id,
      before,
      after,
    });
    return { ok: true as const, activity_id: activity.id };
  });
}

export async function linkGraphNodes(
  pool: Pool,
  input: LinkInput,
): Promise<{ edge: Edge; activity_id: string; suggestion?: string } | ToolError> {
  return withTransaction(pool, async (client) => {
    const from = await getNodeById(client, input.from_id);
    const to = await getNodeById(client, input.to_id);
    if (!from) {
      return toolError(
        `from_id not found: ${input.from_id}`,
        "Pass a live node UUID from upsert.",
      );
    }
    if (!to) {
      return toolError(`to_id not found: ${input.to_id}`, "Pass a live node UUID from upsert.");
    }

    const nodeTypes = await listNodeTypes(client);
    const relationTypes = await listRelationTypes(client);
    const existingEdges = await listEdgesTouching(client, [from.id, to.id]);

    const result = validateLink(
      {
        from_id: from.id,
        to_id: to.id,
        relation_type: input.relation_type,
        from_type: from.type,
        to_type: to.type,
        upgrade: input.upgrade,
      },
      { nodeTypes, relationTypes, existingEdges },
    );
    if (!result.ok) {
      return toolError(result.error, result.suggestion);
    }

    const { edge, droppedStaleChildOf } = await insertEdge(client, {
      from_id: from.id,
      to_id: to.id,
      relation_type: result.relation_type,
      metadata: input.metadata ?? {},
    });
    for (const dropped of droppedStaleChildOf) {
      await insertActivity(client, {
        action: "unlink",
        target_kind: "edge",
        target_id: dropped.id,
        before: dropped,
        after: null,
      });
    }
    const activity = await insertActivity(client, {
      action: "link",
      target_kind: "edge",
      target_id: edge.id,
      before: null,
      after: edge,
    });
    return {
      edge,
      activity_id: activity.id,
      ...(result.suggestion ? { suggestion: result.suggestion } : {}),
    };
  });
}

export async function unlinkGraphNodes(
  pool: Pool,
  input: { from_id: string; to_id: string; relation_type: string; confirm?: boolean },
): Promise<{ ok: true; activity_id: string } | ToolError> {
  const confirmErr = missingConfirm("unlink", input.confirm);
  if (confirmErr) {
    return confirmErr;
  }
  return withTransaction(pool, async (client) => {
    const before = await findEdge(client, input.from_id, input.to_id, input.relation_type);
    if (!before) {
      return toolError(
        `Edge not found: ${input.relation_type} from ${input.from_id} to ${input.to_id}`,
        "Pass from_id, to_id, and relation_type of an existing edge. Edges are the only source of truth.",
      );
    }
    const deleted = await deleteEdge(client, input.from_id, input.to_id, input.relation_type);
    const activity = await insertActivity(client, {
      action: "unlink",
      target_kind: "edge",
      target_id: before.id,
      before,
      after: deleted ?? null,
    });
    return { ok: true as const, activity_id: activity.id };
  });
}

export async function inspectOntology(
  pool: Pool,
  kind: "types" | "relations" | "all" = "all",
): Promise<{ types: NodeType[]; relations: RelationType[] }> {
  const types = kind === "relations" ? [] : await listNodeTypes(pool);
  const relations = kind === "types" ? [] : await listRelationTypes(pool);
  return { types, relations };
}

export async function manageType(
  pool: Pool,
  input: ManageTypeInput,
): Promise<{ type: NodeType; activity_id: string } | ToolError> {
  const existing = await getNodeType(pool, input.slug);

  if (input.action === "create") {
    if (existing) {
      return toolError(
        `Type "${input.slug}" already exists`,
        "Use action: \"update\" to change it, or pick a new slug.",
      );
    }
    const parentTypes = input.parent_types ?? [];
    const parentErr = await assertTypeSlugsExist(pool, parentTypes, "parent_types");
    if (parentErr) {
      return parentErr;
    }
    return withTransaction(pool, async (client) => {
      const type = await insertNodeType(client, {
        slug: input.slug,
        label: input.label ?? labelFromSlug(input.slug),
        description: input.description ?? "",
        kind: input.kind ?? "artifact",
        parent_types: parentTypes,
        json_schema: input.json_schema ?? null,
      });
      const activity = await insertActivity(client, {
        action: "type_change",
        target_kind: "type",
        target_id: type.slug,
        before: null,
        after: type,
      });
      return { type, activity_id: activity.id };
    });
  }

  if (!existing) {
    return toolError(
      `Type "${input.slug}" not found`,
      "Use action: \"create\" to add it. Call inspect_ontology for current slugs.",
    );
  }
  const locked = assertSystemTypePatch(existing, {
    label: input.label,
    kind: input.kind,
    parent_types: input.parent_types,
    json_schema: input.json_schema,
  });
  if (locked) {
    return locked;
  }

  if (existing.is_system) {
    return withTransaction(pool, async (client) => {
      const type = await updateNodeTypeDescription(
        client,
        input.slug,
        input.description ?? existing.description,
      );
      if (!type) {
        return toolError(`Type "${input.slug}" not found`);
      }
      const activity = await insertActivity(client, {
        action: "type_change",
        target_kind: "type",
        target_id: type.slug,
        before: existing,
        after: type,
      });
      return { type, activity_id: activity.id };
    });
  }

  const parentTypes = input.parent_types ?? existing.parent_types;
  const parentErr = await assertTypeSlugsExist(pool, parentTypes, "parent_types");
  if (parentErr) {
    return parentErr;
  }

  return withTransaction(pool, async (client) => {
    const type = await updateNodeType(client, input.slug, {
      label: input.label ?? existing.label,
      description: input.description ?? existing.description,
      kind: input.kind ?? existing.kind,
      parent_types: parentTypes,
      json_schema: input.json_schema === undefined ? existing.json_schema : input.json_schema,
    });
    if (!type) {
      return toolError(`Type "${input.slug}" not found`);
    }
    const activity = await insertActivity(client, {
      action: "type_change",
      target_kind: "type",
      target_id: type.slug,
      before: existing,
      after: type,
    });
    return { type, activity_id: activity.id };
  });
}

export async function manageRelation(
  pool: Pool,
  input: ManageRelationInput,
): Promise<{ relation: RelationType; activity_id: string } | ToolError> {
  const existing = await getRelationType(pool, input.slug);

  if (input.action === "create") {
    if (existing) {
      return toolError(
        `Relation "${input.slug}" already exists`,
        "Use action: \"update\" to change it, or pick a new slug.",
      );
    }
    const sourceErr = await assertTypeSlugsExist(pool, input.source_types ?? [], "source_types");
    if (sourceErr) {
      return sourceErr;
    }
    const targetErr = await assertTypeSlugsExist(pool, input.target_types ?? [], "target_types");
    if (targetErr) {
      return targetErr;
    }
    if (input.semantic_parent_slug) {
      const parent = await getRelationType(pool, input.semantic_parent_slug);
      if (!parent) {
        return toolError(
          `Unknown semantic_parent_slug "${input.semantic_parent_slug}"`,
          `Known relations: ${await knownRelationSlugs(pool)}`,
        );
      }
    }
    return withTransaction(pool, async (client) => {
      const relation = await insertRelationType(client, {
        slug: input.slug,
        label: input.label ?? labelFromSlug(input.slug),
        description: input.description ?? "",
        kind: input.kind ?? "associative",
        source_types: input.source_types ?? [],
        target_types: input.target_types ?? [],
        is_symmetric: input.is_symmetric ?? false,
        semantic_parent_slug: input.semantic_parent_slug ?? null,
      });
      const activity = await insertActivity(client, {
        action: "relation_change",
        target_kind: "relation",
        target_id: relation.slug,
        before: null,
        after: relation,
      });
      return { relation, activity_id: activity.id };
    });
  }

  if (!existing) {
    return toolError(
      `Relation "${input.slug}" not found`,
      "Use action: \"create\" to add it. Call inspect_ontology for current slugs.",
    );
  }
  const locked = assertSystemRelationPatch(existing, {
    label: input.label,
    kind: input.kind,
    source_types: input.source_types,
    target_types: input.target_types,
    is_symmetric: input.is_symmetric,
    semantic_parent_slug: input.semantic_parent_slug,
  });
  if (locked) {
    return locked;
  }

  if (existing.is_system) {
    return withTransaction(pool, async (client) => {
      const relation = await updateRelationTypeDescription(
        client,
        input.slug,
        input.description ?? existing.description,
      );
      if (!relation) {
        return toolError(`Relation "${input.slug}" not found`);
      }
      const activity = await insertActivity(client, {
        action: "relation_change",
        target_kind: "relation",
        target_id: relation.slug,
        before: existing,
        after: relation,
      });
      return { relation, activity_id: activity.id };
    });
  }

  const sourceTypes = input.source_types ?? existing.source_types;
  const targetTypes = input.target_types ?? existing.target_types;
  const sourceErr = await assertTypeSlugsExist(pool, sourceTypes, "source_types");
  if (sourceErr) {
    return sourceErr;
  }
  const targetErr = await assertTypeSlugsExist(pool, targetTypes, "target_types");
  if (targetErr) {
    return targetErr;
  }
  const semanticParent =
    input.semantic_parent_slug === undefined
      ? existing.semantic_parent_slug
      : input.semantic_parent_slug;
  if (semanticParent) {
    const parent = await getRelationType(pool, semanticParent);
    if (!parent) {
      return toolError(
        `Unknown semantic_parent_slug "${semanticParent}"`,
        `Known relations: ${await knownRelationSlugs(pool)}`,
      );
    }
  }

  return withTransaction(pool, async (client) => {
    const relation = await updateRelationType(client, input.slug, {
      label: input.label ?? existing.label,
      description: input.description ?? existing.description,
      kind: input.kind ?? existing.kind,
      source_types: sourceTypes,
      target_types: targetTypes,
      is_symmetric: input.is_symmetric ?? existing.is_symmetric,
      semantic_parent_slug: semanticParent,
    });
    if (!relation) {
      return toolError(`Relation "${input.slug}" not found`);
    }
    const activity = await insertActivity(client, {
      action: "relation_change",
      target_kind: "relation",
      target_id: relation.slug,
      before: existing,
      after: relation,
    });
    return { relation, activity_id: activity.id };
  });
}
