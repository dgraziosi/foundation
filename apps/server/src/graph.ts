import {
  decodeBytesBase64,
  deleteEdge,
  findEdge,
  getBlobById,
  getNodeById,
  getNodeType,
  getRelationType,
  ingestBlobBytes,
  ingestBlobFromUpload,
  insertActivity,
  insertEdge,
  insertNode,
  insertNodeType,
  insertRelationType,
  listActivity,
  listEdgesTouching,
  listIncidentEdges,
  listNodeTypes,
  listRelationTypes,
  readBlobBytes,
  resolveBlobFilePath,
  searchNodes,
  softDeleteNode,
  unlinkQuiet,
  updateNode,
  updateNodeType,
  updateNodeTypeDescription,
  updateRelationType,
  updateRelationTypeDescription,
  withTransaction,
  type BlobRuntime,
  type Pool,
  type Queryable,
} from "@foundation/db";
import {
  BLOB_GET_BODY_MAX_BYTES,
  DEFAULT_PAYLOAD,
  assertSystemRelationPatch,
  assertSystemTypePatch,
  labelFromSlug,
  missingConfirm,
  isToolError,
  storedBlobPayload,
  toolError,
  validateBlobRelativePath,
  validateInlinePayload,
  validateLink,
  type Activity,
  type Blob,
  type Edge,
  type IncidentEdge,
  type LinkInput,
  type ListActivityInput,
  type ManageRelationInput,
  type ManageTypeInput,
  type Node,
  type NodeType,
  type Payload,
  type RelationType,
  type SearchInput,
  type ToolError,
  type UpsertInput,
  type UpsertPayload,
} from "@foundation/schema";
import { randomUUID } from "node:crypto";
import { undoGraphActivity } from "./undo.js";

export { undoGraphActivity };

async function knownTypeSlugs(pool: Pool): Promise<string> {
  const types = await listNodeTypes(pool);
  return types.map((type) => type.slug).join(", ");
}

async function knownRelationSlugs(pool: Pool): Promise<string> {
  const relations = await listRelationTypes(pool);
  return relations.map((type) => type.slug).join(", ");
}

async function snapshotNodeForActivity(
  db: Queryable,
  node: Node,
  blob?: Blob,
): Promise<unknown> {
  if (node.payload.storage !== "blob" || !node.payload.blob_id) {
    return node;
  }
  const meta =
    blob ??
    (await getBlobById(db, node.payload.blob_id)) ??
    undefined;
  return {
    ...node,
    payload: storedBlobPayload(node.payload.media_type, node.payload.blob_id),
    blob: meta
      ? {
          blob_id: meta.id,
          sha256: meta.sha256,
          byte_size: meta.byte_size,
          media_type: meta.media_type,
        }
      : { blob_id: node.payload.blob_id },
  };
}

async function presentBlobNode(
  node: Node,
  blob: Blob | undefined,
  options: { include_body?: boolean; blobs?: BlobRuntime },
): Promise<Node | ToolError> {
  const payload: Payload = storedBlobPayload(
    node.payload.media_type,
    node.payload.blob_id!,
  );
  if (!options.include_body) {
    return { ...node, payload };
  }
  if (!blob) {
    return toolError(
      `Blob not found: ${node.payload.blob_id}`,
      "The node points at a blob_id that is not in the blobs table.",
    );
  }
  if (blob.byte_size > BLOB_GET_BODY_MAX_BYTES) {
    return toolError(
      "Blob is too large to inline in get",
      `Fetch bytes with HTTP GET /blobs/${blob.id} (API key). get include_body inlines at most ${BLOB_GET_BODY_MAX_BYTES} bytes.`,
    );
  }
  if (!options.blobs) {
    return toolError(
      "Blob body is not available",
      `Fetch bytes with HTTP GET /blobs/${blob.id} (API key).`,
    );
  }
  const bytes = await readBlobBytes(options.blobs.dataDir, blob);
  if ("error" in bytes) {
    return bytes;
  }
  return {
    ...node,
    payload: { ...payload, body: bytes.toString("base64") },
  };
}

type ResolvedStoredPayload = {
  payload?: Payload;
  blob?: Blob;
  created?: boolean;
  pendingUploadUnlink?: string;
};

async function resolveStoredPayload(
  db: Queryable,
  payload: UpsertPayload | undefined,
  blobs?: BlobRuntime,
): Promise<ResolvedStoredPayload | ToolError> {
  if (!payload) {
    return {};
  }
  if (payload.storage !== "blob") {
    const stored: Payload = {
      media_type: payload.media_type,
      storage: "inline",
      body: payload.body ?? "",
    };
    const err = validateInlinePayload(stored);
    if (err) {
      return err;
    }
    return { payload: stored };
  }

  if (payload.blob_id) {
    const blob = await getBlobById(db, payload.blob_id);
    if (!blob) {
      return toolError(
        `Blob not found: ${payload.blob_id}`,
        "Ingest first with payload.bytes_base64 or payload.source_path under FOUNDATION_DATA/uploads.",
      );
    }
    const pathErr = validateBlobRelativePath(blob.path);
    if (pathErr) {
      return pathErr;
    }
    return {
      payload: storedBlobPayload(payload.media_type, blob.id),
      blob,
    };
  }

  if (!blobs) {
    return toolError(
      "Blob ingest requires FOUNDATION_DATA",
      "Canonical files are stored under FOUNDATION_DATA/blobs, not agent-data.",
    );
  }

  if (payload.bytes_base64 !== undefined) {
    const bytes = decodeBytesBase64(payload.bytes_base64);
    if ("error" in bytes) {
      return bytes;
    }
    const ingested = await ingestBlobBytes(db, blobs, {
      mediaType: payload.media_type,
      bytes,
    });
    if ("error" in ingested) {
      return ingested;
    }
    return {
      payload: storedBlobPayload(payload.media_type, ingested.blob.id),
      blob: ingested.blob,
      created: ingested.created,
    };
  }

  if (payload.source_path !== undefined) {
    const ingested = await ingestBlobFromUpload(db, blobs, {
      mediaType: payload.media_type,
      sourcePath: payload.source_path,
    });
    if ("error" in ingested) {
      return ingested;
    }
    return {
      payload: storedBlobPayload(payload.media_type, ingested.blob.id),
      blob: ingested.blob,
      created: ingested.created,
      pendingUploadUnlink: ingested.sourceAbs,
    };
  }

  return toolError(
    "blob payload requires blob_id, bytes_base64, or source_path",
    "Ingest with bytes_base64 (small files) or source_path under FOUNDATION_DATA/uploads, or pass an existing blob_id.",
  );
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
  options: { include_body?: boolean; blobs?: BlobRuntime } = {},
): Promise<{ node: Node; edges: IncidentEdge[]; blob?: Blob } | ToolError> {
  const node = await getNodeById(pool, id);
  if (!node) {
    return toolError(
      `Node not found: ${id}`,
      "Use a live node UUID from upsert. Deleted nodes are hidden until restored via undo.",
    );
  }
  const edges = await listIncidentEdges(pool, id);
  if (node.payload.storage !== "blob" || !node.payload.blob_id) {
    return { node, edges };
  }
  const blob = await getBlobById(pool, node.payload.blob_id);
  const presented = await presentBlobNode(node, blob, options);
  if ("error" in presented) {
    return presented;
  }
  return {
    node: presented,
    edges,
    ...(blob ? { blob } : {}),
  };
}

export async function upsertGraphNode(
  pool: Pool,
  input: UpsertInput,
  blobs?: BlobRuntime,
): Promise<{ node: Node; activity_id: string } | ToolError> {
  const type = await getNodeType(pool, input.type);
  if (!type) {
    return toolError(
      `Unknown type "${input.type}"`,
      `Call inspect_ontology or bootstrap, or manage_type to add it. Known types: ${await knownTypeSlugs(pool)}`,
    );
  }

  let createdBlobAbs: string | undefined;
  let pendingUploadUnlink: string | undefined;

  try {
    const result = await withTransaction(pool, async (client) => {
      let existing: Node | undefined;
      if (input.id) {
        existing = await getNodeById(client, input.id, { includeDeleted: true });
        if (existing?.deleted_at) {
          return toolError(
            `Node ${input.id} is deleted`,
            "Restore via undo. Use a new id to create another node.",
          );
        }
      }

      const resolved = await resolveStoredPayload(client, input.payload, blobs);
      if ("error" in resolved) {
        return resolved;
      }
      pendingUploadUnlink = resolved.pendingUploadUnlink;
      if (resolved.created && resolved.blob && blobs) {
        const abs = resolveBlobFilePath(blobs.dataDir, resolved.blob.path);
        if (typeof abs === "string") {
          createdBlobAbs = abs;
        }
      }

      if (existing) {
        const node = await updateNode(client, input.id!, {
          type: input.type,
          title: input.title,
          status: input.status,
          payload: resolved.payload,
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
          before: await snapshotNodeForActivity(client, existing),
          after: await snapshotNodeForActivity(client, node, resolved.blob),
        });
        return { node, activity_id: activity.id };
      }

      const node = await insertNode(client, {
        id: input.id ?? randomUUID(),
        type: input.type,
        title: input.title,
        status: input.status ?? "active",
        payload: resolved.payload ?? DEFAULT_PAYLOAD,
        data: input.data ?? {},
        metadata: input.metadata ?? {},
      });
      const activity = await insertActivity(client, {
        action: "create",
        target_kind: "node",
        target_id: node.id,
        before: null,
        after: await snapshotNodeForActivity(client, node, resolved.blob),
      });
      return { node, activity_id: activity.id };
    });

    if (isToolError(result)) {
      if (createdBlobAbs) {
        await unlinkQuiet(createdBlobAbs);
      }
      return result;
    }
    if (pendingUploadUnlink) {
      await unlinkQuiet(pendingUploadUnlink);
    }
    return result;
  } catch (error) {
    if (createdBlobAbs) {
      await unlinkQuiet(createdBlobAbs);
    }
    throw error;
  }
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
      before: await snapshotNodeForActivity(client, before),
      after: await snapshotNodeForActivity(client, after),
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

export async function listGraphActivity(
  pool: Pool,
  input: ListActivityInput,
): Promise<{ activities: Activity[] } | ToolError> {
  let since: Date | undefined;
  if (input.since) {
    const parsed = Date.parse(input.since);
    if (Number.isNaN(parsed)) {
      return toolError(
        `Invalid since timestamp: ${input.since}`,
        "Pass an ISO-8601 timestamp, e.g. 2026-08-13T00:00:00Z.",
      );
    }
    since = new Date(parsed);
  }
  const activities = await listActivity(pool, {
    action: input.action,
    target: input.target,
    since,
    limit: input.limit,
  });
  return { activities };
}

export async function searchGraphNodes(
  pool: Pool,
  input: SearchInput,
): Promise<{ nodes: Node[] } | ToolError> {
  if (input.type) {
    const type = await getNodeType(pool, input.type);
    if (!type) {
      return toolError(
        `Unknown type "${input.type}"`,
        `Call inspect_ontology. Known types: ${await knownTypeSlugs(pool)}`,
      );
    }
  }
  const nodes = await searchNodes(pool, {
    query: input.query,
    type: input.type,
    limit: input.limit,
  });
  return { nodes };
}
