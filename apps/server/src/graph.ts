import {
  decodeBytesBase64,
  deleteEdge,
  findEdge,
  getBlobById,
  getCreateActivityForNode,
  getNodeById,
  getNodeByIdempotencyKey,
  getNodeByUrl,
  getNodeByRepo,
  getNodeByReceipt,
  getNodeType,
  getRelationType,
  ingestBlobBytes,
  ingestBlobFromUpload,
  insertActivity,
  insertEdge,
  insertNode,
  insertNodeType,
  insertRelationType,
  isChildOfParent,
  listActivity,
  listEdgesTouching,
  listInboundRefPointers,
  listIncidentEdges,
  listNodeTypes,
  listRelationTypes,
  readBlobBytes,
  resolveBlobFilePath,
  lookupNodeCandidates,
  searchNodes,
  softDeleteNode,
  unlinkQuiet,
  updateNode,
  updateNodeType,
  updateRelationType,
  withTransaction,
  isUniqueViolation,
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
  typeViewsFromInput,
  typeViewsFromUpdate,
  compileJsonSchemaFromFields,
  parseTypeFieldsInput,
  parseTypeIdentity,
  isUuid,
  missingDestructive,
  storedBlobPayload,
  toolError,
  validateBlobRelativePath,
  validateInlinePayload,
  validateExistingLink,
  validateLinkSequence,
  findInBatchLinkDuplicate,
  normalizeLinkEdges,
  LINK_CAS_AGREE_SUGGESTION,
  MISSING_BASE_SUGGESTION,
  parseTimestampMs,
  timestampsEqual,
  LIST_CURSOR_INVALID_SUGGESTION,
  SEARCH_MISS_SUGGESTION,
  SEARCH_NO_SELECTOR_SUGGESTION,
  SEARCH_UUID_SUGGESTION,
  encodeActivityCursor,
  encodeSearchCursor,
  parseActivityCursor,
  parseSearchCursor,
  LOOKUP_NO_SELECTOR_SUGGESTION,
  LOOKUP_CANDIDATE_DEFAULT,
  applyAliasesFromPatch,
  applyUrlFromPatch,
  classifyLookupResult,
  createPreflightFromLookup,
  REPO_HIT_SUGGESTION,
  REPO_MISS_SUGGESTION,
  RECEIPT_HIT_SUGGESTION,
  RECEIPT_MISS_SUGGESTION,
  URL_HIT_SUGGESTION,
  URL_MISS_SUGGESTION,
  DUE_DATE_SUGGESTION,
  assertIfMatch,
  LOST_UPDATE_SUGGESTION,
  isToolError,
  urlIdentityConflictError,
  urlIdentityFromMetadata,
  applyUrlIdentityFromUpsert,
  hasLeftoverIdentityKeys,
  migrateLeftoverIdentity,
  repoConflictError,
  repoFromData,
  canonicalizeRepoInData,
  receiptConflictError,
  receiptFromData,
  canonicalizeReceiptInData,
  canonicalizeDueInData,
  dueFromData,
  dueKeyIsInvalid,
  matchesDueFilters,
  matchesDataEquals,
  searchHasSelector,
  todayInNewYork,
  validateDataAgainstJsonSchema,
  type Blob,
  type Edge,
  type IncidentEdge,
  type LinkEdgeItem,
  type LinkInput,
  type LinkItemSuccess,
  type ListActivityInput,
  type ListActivitySuccess,
  type ManageRelationInput,
  type ManageTypeInput,
  type Node,
  type NodeType,
  type Payload,
  type RelationType,
  type LookupInput,
  type LookupSuccess,
  type SearchInput,
  type SearchSuccess,
  type SuggestedLink,
  type ToolError,
  type DeleteInput,
  type DuplicateWarning,
  type UnlinkInput,
  type UpsertInput,
  type UpsertPayload,
} from "@foundation/schema";
import { randomUUID } from "node:crypto";
import { removeAuthoredType } from "./retire-type.js";
import { suggestLinksForNode } from "./suggested-links.js";
import { undoGraphActivity } from "./undo.js";
import { writerFrom, type WriteContext } from "./write-context.js";

export { undoGraphActivity };
export type { WriteContext };

function mergedNodeData(
  existing: Node | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (patch === undefined) {
    return existing?.data ?? {};
  }
  return { ...(existing?.data ?? {}), ...patch };
}

function validateUpsertData(type: NodeType, data: Record<string, unknown>): ToolError | null {
  const repo = repoFromData(data);
  if (isToolError(repo)) {
    return repo;
  }
  const receipt = receiptFromData(data);
  if (isToolError(receipt)) {
    return receipt;
  }
  if (dueKeyIsInvalid(data)) {
    return toolError("data.due must be an ISO date YYYY-MM-DD", DUE_DATE_SUGGESTION);
  }
  return validateDataAgainstJsonSchema(data, type.json_schema, type.slug);
}

async function validateRefFields(
  db: Queryable,
  type: NodeType,
  data: Record<string, unknown>,
): Promise<ToolError | null> {
  for (const field of type.fields ?? []) {
    if (field.kind !== "ref") {
      continue;
    }
    const value = data[field.name];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value !== "string" || !isUuid(value)) {
      return toolError(
        `data.${field.name} must be a node UUID`,
        `Pass a live ${field.ref_type ?? "node"} id. A ref field is a pointer, not an edge.`,
      );
    }
    const target = await getNodeById(db, value);
    if (!target) {
      return toolError(
        `data.${field.name} is not a live node`,
        "Call get or lookup for a live UUID. A ref field does not create an edge.",
      );
    }
    if (field.ref_type && target.type !== field.ref_type) {
      return toolError(
        `data.${field.name} must be a ${field.ref_type}`,
        `Call inspect_ontology. This ref points at type ${field.ref_type}.`,
      );
    }
  }
  return null;
}

async function urlUniqueError(
  db: Queryable,
  metadata: Record<string, unknown>,
  selfId?: string,
): Promise<ToolError | null> {
  const url = urlIdentityFromMetadata(metadata);
  if (!url || isToolError(url)) {
    return null;
  }
  const existing = await getNodeByUrl(db, url);
  if (existing && existing.id !== selfId) {
    return urlIdentityConflictError(existing.id, url);
  }
  return null;
}

async function repoUniqueError(
  db: Queryable,
  data: Record<string, unknown>,
  selfId?: string,
): Promise<ToolError | null> {
  const repo = repoFromData(data);
  if (!repo || isToolError(repo)) {
    return null;
  }
  const existing = await getNodeByRepo(db, repo);
  if (existing && existing.id !== selfId) {
    return repoConflictError(existing.id, repo);
  }
  return null;
}

async function receiptUniqueError(
  db: Queryable,
  data: Record<string, unknown>,
  selfId?: string,
): Promise<ToolError | null> {
  const receipt = receiptFromData(data);
  if (!receipt || isToolError(receipt)) {
    return null;
  }
  const existing = await getNodeByReceipt(db, receipt);
  if (existing && existing.id !== selfId) {
    return receiptConflictError(existing.id, receipt);
  }
  return null;
}

async function uniqueDataError(
  db: Queryable,
  data: Record<string, unknown>,
  metadata: Record<string, unknown>,
  selfId?: string,
): Promise<ToolError | null> {
  return (
    (await urlUniqueError(db, metadata, selfId)) ??
    (await repoUniqueError(db, data, selfId)) ??
    (await receiptUniqueError(db, data, selfId))
  );
}

async function createDuplicatePreflight(
  db: Queryable,
  input: { title: string; type: string; allow_duplicate?: boolean },
): Promise<{ block?: ToolError; warning?: DuplicateWarning }> {
  const raw = await lookupNodeCandidates(db, [{ idx: 0, name: input.title, type: input.type }]);
  const classified = classifyLookupResult(
    { name: input.title, type: input.type },
    raw.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      confidence: row.confidence,
      match: row.match,
      matched_value: row.matched_value,
    })),
    LOOKUP_CANDIDATE_DEFAULT,
  );
  const decision = createPreflightFromLookup(classified);
  if (decision.action === "block") {
    if (input.allow_duplicate) {
      return {};
    }
    return { block: decision.error };
  }
  if (decision.action === "warn") {
    return { warning: decision.warning };
  }
  return {};
}

async function replayIdempotentCreate(
  db: Queryable,
  node: Node,
): Promise<{ node: Node; activity_id: string } | ToolError> {
  if (node.deleted_at) {
    return toolError(
      `Idempotency key already used by deleted node ${node.id}`,
      "Restore via undo, or pass a new idempotency_key to create another node.",
    );
  }
  const created = await getCreateActivityForNode(db, node.id);
  if (!created) {
    return toolError(
      `Idempotency key already used by node ${node.id}`,
      "Call get with that id. Do not create a twin.",
    );
  }
  return { node, activity_id: created.id };
}

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
): Promise<
  { node: Node; edges: IncidentEdge[]; blob?: Blob; suggested_links: SuggestedLink[] } | ToolError
> {
  const node = await getNodeById(pool, id);
  if (!node) {
    return toolError(
      `Node not found: ${id}`,
      "If you already have a UUID, call get. Search is for lexical recall, not a substitute for get. Deleted nodes are hidden until restored via undo.",
    );
  }
  const edges = await listIncidentEdges(pool, id);
  const suggested_links = await suggestLinksForNode(pool, node);
  if (node.payload.storage !== "blob" || !node.payload.blob_id) {
    return { node, edges, suggested_links };
  }
  const blob = await getBlobById(pool, node.payload.blob_id);
  const presented = await presentBlobNode(node, blob, options);
  if ("error" in presented) {
    return presented;
  }
  return {
    node: presented,
    edges,
    suggested_links,
    ...(blob ? { blob } : {}),
  };
}

export async function upsertGraphNode(
  pool: Pool,
  input: UpsertInput,
  blobs?: BlobRuntime,
  ctx?: WriteContext,
): Promise<
  | {
      node: Node;
      activity_id: string;
      suggested_links: SuggestedLink[];
      duplicate_warnings?: DuplicateWarning;
    }
  | ToolError
> {
  const type = await getNodeType(pool, input.type);
  if (!type) {
    return toolError(
      `Unknown type "${input.type}"`,
      `Call inspect_ontology or bootstrap, or manage_type to add it. Known types: ${await knownTypeSlugs(pool)}`,
    );
  }

  let createdBlobAbs: string | undefined;
  let pendingUploadUnlink: string | undefined;
  let discardCreatedBlob = false;
  const writer = writerFrom(ctx);

  async function applyResolvedPayload(resolved: ResolvedStoredPayload): Promise<void> {
    pendingUploadUnlink = resolved.pendingUploadUnlink;
    if (resolved.created && resolved.blob && blobs) {
      const abs = resolveBlobFilePath(blobs.dataDir, resolved.blob.path);
      if (typeof abs === "string") {
        createdBlobAbs = abs;
      }
    }
  }

  try {
    const result = await withTransaction(pool, async (client) => {
      let existing: Node | undefined;
      if (input.id) {
        existing = await getNodeById(client, input.id, { includeDeleted: true, forUpdate: true });
        if (existing?.deleted_at) {
          return toolError(
            `Node ${input.id} is deleted`,
            "Restore via undo. Use a new id to create another node.",
          );
        }
      }

      if (!existing && input.idempotency_key) {
        const replay = await getNodeByIdempotencyKey(client, input.idempotency_key, {
          includeDeleted: true,
        });
        if (replay) {
          return replayIdempotentCreate(client, replay);
        }
      }

      const merged = mergedNodeData(existing, input.data);
      const leftoverPresent = hasLeftoverIdentityKeys(merged);
      const migrated = migrateLeftoverIdentity(merged, existing?.metadata ?? {});
      const canonical = canonicalizeDueInData(
        canonicalizeReceiptInData(canonicalizeRepoInData(migrated.data)),
      );
      const aliased = applyAliasesFromPatch(canonical, input.data);
      if (isToolError(aliased)) {
        return aliased;
      }
      const nextData = applyUrlFromPatch(aliased, input.data);
      if (isToolError(nextData)) {
        return nextData;
      }
      const nextMeta = applyUrlIdentityFromUpsert(
        migrated.metadata,
        input.metadata,
        input.url,
      );
      if (isToolError(nextMeta)) {
        return nextMeta;
      }
      const dataErr = validateUpsertData(type, nextData);
      if (dataErr) {
        return dataErr;
      }
      const refErr = await validateRefFields(client, type, nextData);
      if (refErr) {
        return refErr;
      }

      if (existing) {
        const resolved = await resolveStoredPayload(client, input.payload, blobs);
        if ("error" in resolved) {
          return resolved;
        }
        await applyResolvedPayload(resolved);
        const stale = assertIfMatch("base_updated_at", input.base_updated_at, existing.updated_at);
        if (stale) {
          return stale;
        }
        if (existing.type !== input.type) {
          const edgeErr = await refuseInvalidIncidentEdges(client, existing, input.type);
          if (edgeErr) {
            return edgeErr;
          }
        }
        await client.query("SAVEPOINT upsert_update");
        try {
          const node = await updateNode(client, input.id!, {
            type: input.type,
            title: input.title,
            status: input.status,
            payload: resolved.payload,
            data: input.data === undefined && !leftoverPresent ? undefined : nextData,
            metadata:
              input.metadata === undefined && input.url === undefined && !leftoverPresent
                ? undefined
                : nextMeta,
            base_updated_at: input.base_updated_at,
          });
          await client.query("RELEASE SAVEPOINT upsert_update");
          if (!node) {
            const current = await getNodeById(client, input.id!, { includeDeleted: true });
            if (!current) {
              return toolError(
                `Node not found: ${input.id}`,
                "If you already have a UUID, call get. Search is for lexical recall, not a substitute for get. Deleted nodes are hidden until restored via undo.",
              );
            }
            if (current.deleted_at) {
              return toolError(
                `Node ${input.id} is deleted`,
                "Restore via undo. Use a new id to create another node.",
              );
            }
            return toolError(
              "base_updated_at does not match current updated_at",
              LOST_UPDATE_SUGGESTION,
            );
          }
          const activity = await insertActivity(client, {
            ...writer,
            action: "update",
            target_kind: "node",
            target_id: node.id,
            before: await snapshotNodeForActivity(client, existing),
            after: await snapshotNodeForActivity(client, node, resolved.blob),
          });
          return { node, activity_id: activity.id };
        } catch (error) {
          if (isUniqueViolation(error)) {
            await client.query("ROLLBACK TO SAVEPOINT upsert_update");
            const pointerErr = await uniqueDataError(client, nextData, nextMeta, existing.id);
            if (pointerErr) {
              return pointerErr;
            }
          }
          throw error;
        }
      }

      let duplicate_warnings: DuplicateWarning | undefined;
      if (!input.id) {
        const preflight = await createDuplicatePreflight(client, {
          title: input.title,
          type: input.type,
          allow_duplicate: input.allow_duplicate,
        });
        if (preflight.block) {
          return preflight.block;
        }
        duplicate_warnings = preflight.warning;
      }

      await client.query("SAVEPOINT upsert_insert");
      try {
        const resolved = await resolveStoredPayload(client, input.payload, blobs);
        if ("error" in resolved) {
          return resolved;
        }
        await applyResolvedPayload(resolved);
        const node = await insertNode(client, {
          id: input.id ?? randomUUID(),
          type: input.type,
          title: input.title,
          status: input.status ?? "active",
          payload: resolved.payload ?? DEFAULT_PAYLOAD,
          data: nextData,
          metadata: nextMeta,
          idempotency_key: input.idempotency_key ?? null,
        });
        await client.query("RELEASE SAVEPOINT upsert_insert");
        const activity = await insertActivity(client, {
          ...writer,
          action: "create",
          target_kind: "node",
          target_id: node.id,
          before: null,
          after: await snapshotNodeForActivity(client, node, resolved.blob),
        });
        return {
          node,
          activity_id: activity.id,
          ...(duplicate_warnings ? { duplicate_warnings } : {}),
        };
      } catch (error) {
        if (isUniqueViolation(error)) {
          await client.query("ROLLBACK TO SAVEPOINT upsert_insert");
          discardCreatedBlob = true;
          pendingUploadUnlink = undefined;
          if (input.idempotency_key) {
            const replay = await getNodeByIdempotencyKey(client, input.idempotency_key, {
              includeDeleted: true,
            });
            if (replay) {
              return replayIdempotentCreate(client, replay);
            }
          }
          const pointerErr = await uniqueDataError(client, nextData, nextMeta);
          if (pointerErr) {
            return pointerErr;
          }
        }
        throw error;
      }
    });

    if (isToolError(result) || discardCreatedBlob) {
      if (createdBlobAbs) {
        await unlinkQuiet(createdBlobAbs);
      }
      if (isToolError(result)) {
        return result;
      }
    }
    if (pendingUploadUnlink) {
      await unlinkQuiet(pendingUploadUnlink);
    }
    if (isToolError(result)) {
      return result;
    }
    return {
      ...result,
      suggested_links: await suggestLinksForNode(pool, result.node),
    };
  } catch (error) {
    if (createdBlobAbs) {
      await unlinkQuiet(createdBlobAbs);
    }
    throw error;
  }
}

export async function deleteGraphNode(
  pool: Pool,
  input: DeleteInput,
  ctx?: WriteContext,
): Promise<{ ok: true; activity_id: string } | ToolError> {
  const scopeErr = missingDestructive("delete", ctx?.destructive);
  if (scopeErr) {
    return scopeErr;
  }
  const writer = writerFrom(ctx);
  return withTransaction(pool, async (client) => {
    const before = await getNodeById(client, input.id, { includeDeleted: true, forUpdate: true });
    if (!before) {
      return toolError(
        `Node not found: ${input.id}`,
        "delete only soft-deletes a live node. Check the UUID from upsert.",
      );
    }
    const stale = assertIfMatch("base_updated_at", input.base_updated_at, before.updated_at);
    if (stale) {
      return stale;
    }
    if (before.deleted_at) {
      return toolError(
        `Node ${input.id} is deleted`,
        "Restore via undo. Use a new id to create another node.",
      );
    }
    const refErr = await refuseInboundRefPointers(client, input.id);
    if (refErr) {
      return refErr;
    }
    const after = await softDeleteNode(client, input.id, {
      base_updated_at: input.base_updated_at,
    });
    if (!after) {
      return toolError(
        "base_updated_at does not match current updated_at",
        LOST_UPDATE_SUGGESTION,
      );
    }
    const activity = await insertActivity(client, {
      ...writer,
      action: "delete",
      target_kind: "node",
      target_id: after.id,
      before: await snapshotNodeForActivity(client, before),
      after: await snapshotNodeForActivity(client, after),
    });
    return { ok: true as const, activity_id: activity.id };
  });
}

async function refuseInvalidIncidentEdges(
  db: Queryable,
  node: Node,
  nextType: string,
): Promise<ToolError | null> {
  const edges = await listIncidentEdges(db, node.id);
  if (edges.length === 0) {
    return null;
  }
  const [nodeTypes, relationTypes] = await Promise.all([
    listNodeTypes(db),
    listRelationTypes(db),
  ]);
  for (const edge of edges) {
    const fromType = edge.from_id === node.id ? nextType : edge.neighbor.type;
    const toType = edge.to_id === node.id ? nextType : edge.neighbor.type;
    const result = validateExistingLink(
      {
        from_id: edge.from_id,
        to_id: edge.to_id,
        relation_type: edge.relation_type,
        from_type: fromType,
        to_type: toType,
      },
      { nodeTypes, relationTypes },
    );
    if (!result.ok) {
      return toolError(
        `Cannot retype to "${nextType}": live ${edge.relation_type} edge would no longer be allowed`,
        `${result.error}. Unlink that ${edge.relation_type} first (unlink with if-match), then retry upsert. Or keep type ${node.type}.`,
      );
    }
  }
  return null;
}

async function refuseInboundRefPointers(db: Queryable, targetId: string): Promise<ToolError | null> {
  const pointers = await listInboundRefPointers(db, targetId);
  if (pointers.length === 0) {
    return null;
  }
  const listed = pointers
    .slice(0, 5)
    .map((pointer) => `${pointer.node_id} (${pointer.title}, data.${pointer.field})`)
    .join("; ");
  const extra = pointers.length > 5 ? ` and ${pointers.length - 5} more` : "";
  return toolError(
    `Cannot delete: ${pointers.length} live record(s) still point at this id via ref fields`,
    `Clear those fields with upsert (data.<field>: null) and if-match, then retry delete. Pointing records: ${listed}${extra}.`,
  );
}

export type LinkFlatSuccess = LinkItemSuccess & { links: LinkItemSuccess[] };
export type LinkBatchSuccess = { links: LinkItemSuccess[] };

function prefixEdgeError(
  form: "flat" | "batch",
  index: number,
  error: string,
  suggestion?: string,
): ToolError {
  const prefixed = form === "batch" ? `edges[${index}]: ${error}` : error;
  return toolError(prefixed, suggestion);
}

type EndpointClaim = {
  index: number;
  field: "from_base_updated_at" | "to_base_updated_at";
  value: string | undefined;
};

function assertBatchEndpointCas(
  form: "flat" | "batch",
  edges: readonly LinkEdgeItem[],
  locked: ReadonlyMap<string, Node>,
): ToolError | null {
  for (const [index, edge] of edges.entries()) {
    for (const field of ["from_base_updated_at", "to_base_updated_at"] as const) {
      const value = edge[field];
      if (value === undefined) {
        return prefixEdgeError(form, index, `Missing ${field}`, MISSING_BASE_SUGGESTION);
      }
      if (parseTimestampMs(value) === null) {
        return prefixEdgeError(
          form,
          index,
          `Invalid ${field}: ${value}`,
          "Pass an ISO-8601 timestamp from get (node.updated_at).",
        );
      }
    }
  }

  const claims = new Map<string, EndpointClaim[]>();
  const addClaim = (id: string, claim: EndpointClaim) => {
    const list = claims.get(id) ?? [];
    list.push(claim);
    claims.set(id, list);
  };
  for (const [index, edge] of edges.entries()) {
    addClaim(edge.from_id, {
      index,
      field: "from_base_updated_at",
      value: edge.from_base_updated_at,
    });
    addClaim(edge.to_id, {
      index,
      field: "to_base_updated_at",
      value: edge.to_base_updated_at,
    });
  }

  for (const [nodeId, nodeClaims] of claims) {
    const node = locked.get(nodeId)!;
    const first = nodeClaims[0]!;
    for (const claim of nodeClaims) {
      if (!timestampsEqual(first.value!, claim.value!)) {
        return prefixEdgeError(
          form,
          claim.index,
          `${claim.field} disagrees with edges[${first.index}] for ${nodeId}`,
          LINK_CAS_AGREE_SUGGESTION,
        );
      }
    }
    const stale = assertIfMatch(first.field, first.value, node.updated_at);
    if (stale) {
      return prefixEdgeError(form, first.index, stale.error, stale.suggestion);
    }
  }
  return null;
}

export async function linkGraphNodes(
  pool: Pool,
  input: {
    from_id: string;
    to_id: string;
    relation_type: string;
    upgrade?: boolean;
    metadata?: Record<string, unknown>;
    from_base_updated_at?: string;
    to_base_updated_at?: string;
  },
  ctx?: WriteContext,
): Promise<LinkFlatSuccess | ToolError>;
export async function linkGraphNodes(
  pool: Pool,
  input: {
    edges: LinkEdgeItem[];
  },
  ctx?: WriteContext,
): Promise<LinkBatchSuccess | ToolError>;
export async function linkGraphNodes(
  pool: Pool,
  input: LinkInput,
  ctx?: WriteContext,
): Promise<LinkFlatSuccess | LinkBatchSuccess | ToolError>;
export async function linkGraphNodes(
  pool: Pool,
  input: LinkInput,
  ctx?: WriteContext,
): Promise<LinkFlatSuccess | LinkBatchSuccess | ToolError> {
  const normalized = normalizeLinkEdges(input);
  if (isToolError(normalized)) {
    return normalized;
  }
  const { form, edges } = normalized;
  const writer = writerFrom(ctx);
  return withTransaction(pool, async (client) => {
    const lockOrder = [...new Set(edges.flatMap((edge) => [edge.from_id, edge.to_id]))].sort();
    const locked = new Map<string, Node>();
    for (const id of lockOrder) {
      const node = await getNodeById(client, id, { forUpdate: true });
      if (!node) {
        const first = edges.find((edge) => edge.from_id === id || edge.to_id === id)!;
        const index = edges.indexOf(first);
        const which = first.from_id === id ? "from_id" : "to_id";
        return prefixEdgeError(
          form,
          index,
          `${which} not found: ${id}`,
          "Pass a live node UUID from upsert.",
        );
      }
      locked.set(id, node);
    }

    const casErr = assertBatchEndpointCas(form, edges, locked);
    if (casErr) {
      return casErr;
    }

    const nodeTypes = await listNodeTypes(client);
    const relationTypes = await listRelationTypes(client);
    const existingEdges = await listEdgesTouching(client, lockOrder);

    const duplicate = findInBatchLinkDuplicate(edges, { relationTypes });
    if (duplicate) {
      return prefixEdgeError(form, duplicate.index, duplicate.error, duplicate.suggestion);
    }

    const proposals = edges.map((edge) => {
      const from = locked.get(edge.from_id)!;
      const to = locked.get(edge.to_id)!;
      return {
        from_id: from.id,
        to_id: to.id,
        relation_type: edge.relation_type,
        from_type: from.type,
        to_type: to.type,
        upgrade: edge.upgrade,
      };
    });
    const sequenced = validateLinkSequence(proposals, { nodeTypes, relationTypes, existingEdges });
    if (!sequenced.ok) {
      return prefixEdgeError(form, sequenced.index, sequenced.error, sequenced.suggestion);
    }

    const links: LinkItemSuccess[] = [];
    for (const [index, edgeInput] of edges.entries()) {
      const result = sequenced.results[index]!;
      const { edge, droppedStaleChildOf } = await insertEdge(client, {
        from_id: edgeInput.from_id,
        to_id: edgeInput.to_id,
        relation_type: result.relation_type,
        metadata: edgeInput.metadata ?? {},
      });
      for (const dropped of droppedStaleChildOf) {
        await insertActivity(client, {
          ...writer,
          action: "unlink",
          target_kind: "edge",
          target_id: dropped.id,
          before: dropped,
          after: null,
        });
      }
      const activity = await insertActivity(client, {
        ...writer,
        action: "link",
        target_kind: "edge",
        target_id: edge.id,
        before: null,
        after: edge,
      });
      links.push({
        edge,
        activity_id: activity.id,
        ...(result.suggestion ? { suggestion: result.suggestion } : {}),
      });
    }

    if (form === "flat") {
      const only = links[0]!;
      return {
        edge: only.edge,
        activity_id: only.activity_id,
        ...(only.suggestion ? { suggestion: only.suggestion } : {}),
        links,
      };
    }
    return { links };
  });
}

export async function unlinkGraphNodes(
  pool: Pool,
  input: UnlinkInput,
  ctx?: WriteContext,
): Promise<{ ok: true; activity_id: string } | ToolError> {
  const scopeErr = missingDestructive("unlink", ctx?.destructive);
  if (scopeErr) {
    return scopeErr;
  }
  const writer = writerFrom(ctx);
  return withTransaction(pool, async (client) => {
    const lockOrder = [...new Set([input.from_id, input.to_id])].sort();
    const locked = new Map<string, Node>();
    for (const id of lockOrder) {
      const node = await getNodeById(client, id, { forUpdate: true });
      if (!node) {
        const which = id === input.from_id ? "from_id" : "to_id";
        return toolError(
          `${which} not found: ${id}`,
          "Pass a live node UUID from get.",
        );
      }
      locked.set(id, node);
    }
    const from = locked.get(input.from_id)!;
    const to = locked.get(input.to_id)!;
    const fromStale = assertIfMatch(
      "from_base_updated_at",
      input.from_base_updated_at,
      from.updated_at,
    );
    if (fromStale) {
      return fromStale;
    }
    const toStale = assertIfMatch("to_base_updated_at", input.to_base_updated_at, to.updated_at);
    if (toStale) {
      return toStale;
    }
    const before = await findEdge(client, input.from_id, input.to_id, input.relation_type);
    if (!before) {
      return toolError(
        `Edge not found: ${input.relation_type} from ${input.from_id} to ${input.to_id}`,
        "Pass from_id, to_id, and relation_type of an existing edge. Edges are the only source of truth.",
      );
    }
    const deleted = await deleteEdge(client, input.from_id, input.to_id, input.relation_type);
    const activity = await insertActivity(client, {
      ...writer,
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
  ctx?: WriteContext,
): Promise<{ type: NodeType; activity_id: string } | ToolError> {
  const writer = writerFrom(ctx);
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
    const viewsInput = typeViewsFromInput({ views: input.views, default_view: input.default_view });
    if (isToolError(viewsInput)) {
      return viewsInput;
    }
    const knownSlugs = (await listNodeTypes(pool)).map((type) => type.slug);
    const fieldsParsed = parseTypeFieldsInput(input.fields ?? [], [...knownSlugs, input.slug]);
    if (!fieldsParsed.ok) {
      return toolError(fieldsParsed.error, fieldsParsed.suggestion);
    }
    if (input.json_schema !== undefined && input.json_schema !== null && fieldsParsed.fields.length > 0) {
      return toolError(
        `Type "${input.slug}" has a field template; edit fields, not json_schema`,
        "Pass fields to manage_type. json_schema is compiled from fields.",
      );
    }
    const jsonSchema =
      fieldsParsed.fields.length > 0
        ? compileJsonSchemaFromFields(fieldsParsed.fields)
        : (input.json_schema ?? null);
    const identity = parseTypeIdentity({ hue: input.hue, glyph: input.glyph });
    if (!identity.ok) {
      return toolError(identity.error, identity.suggestion);
    }
    return withTransaction(pool, async (client) => {
      const type = await insertNodeType(client, {
        slug: input.slug,
        label: input.label ?? labelFromSlug(input.slug),
        description: input.description ?? "",
        kind: input.kind ?? "artifact",
        parent_types: parentTypes,
        json_schema: jsonSchema,
        views: viewsInput.views,
        default_view: viewsInput.default_view,
        fields: fieldsParsed.fields,
        hue: identity.hue ?? undefined,
        glyph: identity.glyph ?? undefined,
      });
      const activity = await insertActivity(client, {
        ...writer,
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

  if (input.action === "retire") {
    const confirmErr = missingDestructive("manage_type retire", ctx?.destructive);
    if (confirmErr) {
      return confirmErr;
    }
    return withTransaction(pool, async (client) => {
      const removed = await removeAuthoredType(client, input.slug, {
        purgeDeleted: input.purge_deleted === true,
        writer,
        purpose: "retire",
      });
      if ("error" in removed) {
        return removed;
      }
      const activity = await insertActivity(client, {
        ...writer,
        action: "type_change",
        target_kind: "type",
        target_id: removed.type.slug,
        before: removed.type,
        after: null,
      });
      return { type: removed.type, activity_id: activity.id };
    });
  }

  const knownSlugs = (await listNodeTypes(pool)).map((type) => type.slug);
  const fieldsParsed =
    input.fields === undefined
      ? { ok: true as const, fields: existing.fields ?? [] }
      : parseTypeFieldsInput(input.fields, knownSlugs);
  if (!fieldsParsed.ok) {
    return toolError(fieldsParsed.error, fieldsParsed.suggestion);
  }
  const nextFields = fieldsParsed.fields;
  if (input.json_schema !== undefined && nextFields.length > 0) {
    return toolError(
      `Type "${input.slug}" has a field template; edit fields, not json_schema`,
      "Pass fields to manage_type. json_schema is compiled from fields.",
    );
  }

  const locked = assertSystemTypePatch(existing, {
    slug: input.slug,
    label: input.label,
    kind: input.kind,
    parent_types: input.parent_types,
    json_schema: input.json_schema,
    views: input.views,
    default_view: input.default_view,
    fields: input.fields === undefined ? undefined : nextFields,
  });
  if (locked) {
    return locked;
  }

  const parentTypes = existing.is_system ? existing.parent_types : (input.parent_types ?? existing.parent_types);
  if (!existing.is_system) {
    const parentErr = await assertTypeSlugsExist(pool, parentTypes, "parent_types");
    if (parentErr) {
      return parentErr;
    }
  }

  const viewsPatch = typeViewsFromUpdate(existing, {
    views: input.views,
    default_view: input.default_view,
  });
  if (isToolError(viewsPatch)) {
    return viewsPatch;
  }

  const jsonSchema =
    input.fields !== undefined || nextFields.length > 0
      ? compileJsonSchemaFromFields(nextFields)
      : input.json_schema === undefined
        ? existing.json_schema
        : input.json_schema;

  const identity = parseTypeIdentity({ hue: input.hue, glyph: input.glyph });
  if (!identity.ok) {
    return toolError(identity.error, identity.suggestion);
  }
  const hue = identity.hue === undefined ? existing.hue : (identity.hue ?? undefined);
  const glyph = identity.glyph === undefined ? existing.glyph : (identity.glyph ?? undefined);

  return withTransaction(pool, async (client) => {
    const type = await updateNodeType(client, input.slug, {
      label: existing.is_system ? existing.label : (input.label ?? existing.label),
      description: input.description ?? existing.description,
      kind: existing.is_system ? existing.kind : (input.kind ?? existing.kind),
      parent_types: parentTypes,
      json_schema: jsonSchema,
      views: viewsPatch.views,
      default_view: viewsPatch.default_view,
      fields: nextFields,
      hue,
      glyph,
    });
    if (!type) {
      return toolError(`Type "${input.slug}" not found`);
    }
    const activity = await insertActivity(client, {
      ...writer,
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
  ctx?: WriteContext,
): Promise<{ relation: RelationType; activity_id: string } | ToolError> {
  const writer = writerFrom(ctx);
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
        ...writer,
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
      label: existing.is_system ? existing.label : (input.label ?? existing.label),
      description: input.description ?? existing.description,
      kind: existing.is_system ? existing.kind : (input.kind ?? existing.kind),
      source_types: sourceTypes,
      target_types: targetTypes,
      is_symmetric: existing.is_system ? existing.is_symmetric : (input.is_symmetric ?? existing.is_symmetric),
      semantic_parent_slug: existing.is_system ? existing.semantic_parent_slug : semanticParent,
    });
    if (!relation) {
      return toolError(`Relation "${input.slug}" not found`);
    }
    const activity = await insertActivity(client, {
      ...writer,
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
): Promise<ListActivitySuccess | ToolError> {
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
  let cursor;
  if (input.cursor) {
    cursor = parseActivityCursor(input.cursor);
    if (!cursor) {
      return toolError("Invalid list_activity cursor", LIST_CURSOR_INVALID_SUGGESTION);
    }
  }
  const page = await listActivity(pool, {
    action: input.action,
    target: input.target,
    since,
    limit: input.limit,
    cursor,
  });
  return {
    activities: page.activities,
    count: page.count,
    ...(page.next ? { next: encodeActivityCursor(page.next) } : {}),
  };
}

function searchMiss(suggestion: string): SearchSuccess {
  return { nodes: [], count: 0, suggestion };
}

export async function searchGraphNodes(
  pool: Pool,
  input: SearchInput,
): Promise<SearchSuccess | ToolError> {
  const query = input.query?.trim() ? input.query.trim() : undefined;
  if (!searchHasSelector(input)) {
    return toolError("search requires a query or a filter", SEARCH_NO_SELECTOR_SUGGESTION);
  }
  let cursor;
  if (input.cursor) {
    cursor = parseSearchCursor(input.cursor);
    if (!cursor) {
      return toolError("Invalid search cursor", LIST_CURSOR_INVALID_SUGGESTION);
    }
  }
  if (
    input.due_on_or_after &&
    input.due_on_or_before &&
    input.due_on_or_after > input.due_on_or_before
  ) {
    return toolError(
      "due_on_or_after is after due_on_or_before",
      "Pass a window where due_on_or_after is on or before due_on_or_before, e.g. 2026-08-01 and 2026-08-27.",
    );
  }
  const today = todayInNewYork();
  if (input.type) {
    const type = await getNodeType(pool, input.type);
    if (!type) {
      return toolError(
        `Unknown type "${input.type}"`,
        `Call inspect_ontology. Known types: ${await knownTypeSlugs(pool)}`,
      );
    }
  }
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
  if (input.under) {
    const parent = await getNodeById(pool, input.under);
    if (!parent) {
      return toolError(
        `under parent not found: ${input.under}`,
        "Pass a live node UUID. under lists nodes with child_of to that parent.",
      );
    }
  }
  if (query && isUuid(query)) {
    const node = await getNodeById(pool, query);
    if (!node || (input.type && node.type !== input.type) || (input.status && node.status !== input.status)) {
      return searchMiss(SEARCH_MISS_SUGGESTION);
    }
    if (since && Date.parse(node.updated_at) < since.getTime()) {
      return searchMiss(SEARCH_MISS_SUGGESTION);
    }
    if (input.url) {
      const url = urlIdentityFromMetadata(node.metadata);
      if (
        isToolError(url) ||
        !url ||
        url.system !== input.url.system ||
        url.id !== input.url.id
      ) {
        return searchMiss(URL_MISS_SUGGESTION);
      }
    }
    if (input.repo) {
      const repo = repoFromData(node.data);
      if (
        isToolError(repo) ||
        !repo ||
        repo.system !== input.repo.system ||
        repo.id !== input.repo.id
      ) {
        return searchMiss(REPO_MISS_SUGGESTION);
      }
    }
    if (input.receipt) {
      const receipt = receiptFromData(node.data);
      if (
        isToolError(receipt) ||
        !receipt ||
        receipt.system !== input.receipt.system ||
        receipt.id !== input.receipt.id
      ) {
        return searchMiss(RECEIPT_MISS_SUGGESTION);
      }
    }
    if (input.under && !(await isChildOfParent(pool, node.id, input.under))) {
      return searchMiss(SEARCH_MISS_SUGGESTION);
    }
    const due = dueFromData(node.data);
    if (!matchesDueFilters(due, input, today)) {
      return searchMiss(SEARCH_MISS_SUGGESTION);
    }
    if (!matchesDataEquals(node.data, input.data_equals)) {
      return searchMiss(SEARCH_MISS_SUGGESTION);
    }
    return {
      nodes: [
        {
          id: node.id,
          type: node.type,
          title: node.title,
          status: node.status,
          snippet: node.title,
          ...(due ? { due } : {}),
        },
      ],
      count: 1,
      suggestion: SEARCH_UUID_SUGGESTION,
    };
  }
  const page = await searchNodes(pool, {
    query,
    type: input.type,
    status: input.status,
    under: input.under,
    since,
    urlSystem: input.url?.system,
    urlId: input.url?.id,
    repoSystem: input.repo?.system,
    repoId: input.repo?.id,
    receiptSystem: input.receipt?.system,
    receiptId: input.receipt?.id,
    dueOnOrAfter: input.due_on_or_after,
    dueOnOrBefore: input.due_on_or_before,
    dueBefore: input.due === "overdue" ? today : undefined,
    dueExact: input.due === "today" ? today : undefined,
    dataEquals: input.data_equals,
    limit: input.limit,
    cursor,
  });
  const next = page.next ? encodeSearchCursor(page.next) : undefined;
  if (page.hits.length === 0) {
    if (query) {
      return { nodes: [], count: page.count, suggestion: SEARCH_MISS_SUGGESTION };
    }
    if (input.url) {
      return { nodes: [], count: page.count, suggestion: URL_MISS_SUGGESTION };
    }
    if (input.repo) {
      return { nodes: [], count: page.count, suggestion: REPO_MISS_SUGGESTION };
    }
    if (input.receipt) {
      return { nodes: [], count: page.count, suggestion: RECEIPT_MISS_SUGGESTION };
    }
    return { nodes: [], count: page.count };
  }
  if (input.url) {
    return { nodes: page.hits, count: page.count, ...(next ? { next } : {}), suggestion: URL_HIT_SUGGESTION };
  }
  if (input.repo) {
    return { nodes: page.hits, count: page.count, ...(next ? { next } : {}), suggestion: REPO_HIT_SUGGESTION };
  }
  if (input.receipt) {
    return { nodes: page.hits, count: page.count, ...(next ? { next } : {}), suggestion: RECEIPT_HIT_SUGGESTION };
  }
  return { nodes: page.hits, count: page.count, ...(next ? { next } : {}) };
}

export async function lookupGraphNodes(
  pool: Pool,
  input: LookupInput,
): Promise<LookupSuccess | ToolError> {
  if (!input.inputs?.length) {
    return toolError("lookup requires one or more inputs", LOOKUP_NO_SELECTOR_SUGGESTION);
  }
  const limit = input.limit ?? LOOKUP_CANDIDATE_DEFAULT;
  const resolved = input.inputs.map((item) => ({
    name: item.name.trim(),
    type: item.type ?? input.type,
    id: item.id,
  }));
  if (resolved.some((item) => !item.name)) {
    return toolError("lookup requires a non-empty name on each input", LOOKUP_NO_SELECTOR_SUGGESTION);
  }

  const typeSlugs = new Set<string>();
  if (input.type) {
    typeSlugs.add(input.type);
  }
  for (const item of resolved) {
    if (item.type) {
      typeSlugs.add(item.type);
    }
  }
  for (const slug of typeSlugs) {
    const type = await getNodeType(pool, slug);
    if (!type) {
      return toolError(
        `Unknown type "${slug}"`,
        `Call inspect_ontology. Known types: ${await knownTypeSlugs(pool)}`,
      );
    }
  }

  const nameInputs: Array<{ idx: number; name: string; type?: string }> = [];
  const uuidHits = new Map<number, LookupSuccess["results"][number]>();

  for (const [idx, item] of resolved.entries()) {
    if (!isUuid(item.name)) {
      nameInputs.push({ idx, name: item.name, type: item.type });
      continue;
    }
    const node = await getNodeById(pool, item.name);
    if (!node || (item.type && node.type !== item.type)) {
      uuidHits.set(
        idx,
        classifyLookupResult({ name: item.name, type: item.type, id: item.id }, [], limit),
      );
      continue;
    }
    uuidHits.set(
      idx,
      classifyLookupResult(
        { name: item.name, type: item.type, id: item.id },
        [
          {
            id: node.id,
            type: node.type,
            title: node.title,
            status: node.status,
            updated_at: node.updated_at,
            confidence: 1,
            match: "uuid",
            matched_value: node.title,
          },
        ],
        limit,
      ),
    );
  }

  const raw = await lookupNodeCandidates(pool, nameInputs);
  const byIdx = new Map<number, typeof raw>();
  for (const row of raw) {
    const list = byIdx.get(row.idx) ?? [];
    list.push(row);
    byIdx.set(row.idx, list);
  }

  const results = resolved.map((item, idx) => {
    const uuid = uuidHits.get(idx);
    if (uuid) {
      return uuid;
    }
    return classifyLookupResult(
      { name: item.name, type: item.type, id: item.id },
      byIdx.get(idx) ?? [],
      limit,
    );
  });

  return { results };
}
