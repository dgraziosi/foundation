import {
  countEdgesByRelation,
  countRelationsUsingSemanticParent,
  deleteEdgeById,
  deleteRelationType,
  getActivityById,
  getEdgeById,
  getNodeById,
  getNodeType,
  getRelationType,
  insertActivity,
  insertNodeType,
  markActivityUndone,
  restoreEdge,
  restoreNode,
  restoreNodeSnapshot,
  softDeleteNode,
  updateNodeType,
  updateNodeTypeDescription,
  updateRelationType,
  updateRelationTypeDescription,
  withTransaction,
  isForeignKeyViolation,
  isUniqueViolation,
  type Pool,
  type PoolClient,
} from "@foundation/db";
import {
  EdgeSchema,
  NodeSchema,
  NodeTypeSchema,
  RelationTypeSchema,
  missingConfirm,
  toolError,
  type Activity,
  type Edge,
  type Node,
  type NodeType,
  type RelationType,
  type ToolError,
  type UndoInput,
} from "@foundation/schema";
import { removeAuthoredType } from "./retire-type.js";

function snapshotNode(value: unknown): Node | null {
  const parsed = NodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function snapshotEdge(value: unknown): Edge | null {
  const parsed = EdgeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function snapshotType(value: unknown): NodeType | null {
  const parsed = NodeTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function snapshotRelation(value: unknown): RelationType | null {
  const parsed = RelationTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function expired(row: Activity): boolean {
  if (!row.token_expires_at) {
    return false;
  }
  return Date.parse(row.token_expires_at) <= Date.now();
}

async function invertCreateNode(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const created = snapshotNode(row.after);
  if (!created) {
    return toolError("Create activity is missing a node snapshot", "This row cannot be undone.");
  }
  const live = await getNodeById(client, created.id);
  if (!live) {
    return toolError(
      `Cannot undo create: node ${created.id} is missing or already deleted`,
      "Undo of create soft-deletes the node. It may already have been deleted.",
    );
  }
  const after = await softDeleteNode(client, live.id);
  if (!after) {
    return toolError(`Node not found: ${live.id}`);
  }
  return { action: "delete", before: live, after };
}

async function invertUpdateNode(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const before = snapshotNode(row.before);
  if (!before) {
    return toolError("Update activity is missing a before snapshot", "This row cannot be undone.");
  }
  const current = await getNodeById(client, before.id, { includeDeleted: true });
  if (!current) {
    return toolError(`Cannot undo update: node ${before.id} not found`);
  }
  try {
    const restored = await restoreNodeSnapshot(client, before);
    if (!restored) {
      return toolError(`Cannot undo update: node ${before.id} not found`);
    }
    return { action: "update", before: current, after: restored };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toolError(
        "Cannot undo update: restoring this node would duplicate a live origin (system, id)",
        "Search origin to find the live node. Do not twin people. Change or delete the live origin first.",
      );
    }
    if (isForeignKeyViolation(error)) {
      return toolError(
        `Cannot undo update: restoring node ${before.id} references a missing type`,
        "Restore the type first, then retry undo.",
      );
    }
    throw error;
  }
}

async function invertDeleteNode(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const deleted = snapshotNode(row.after) ?? snapshotNode(row.before);
  if (!deleted) {
    return toolError("Delete activity is missing a node snapshot", "This row cannot be undone.");
  }
  const current = await getNodeById(client, deleted.id, { includeDeleted: true });
  if (!current) {
    return toolError(`Cannot undo delete: node ${deleted.id} not found`);
  }
  if (!current.deleted_at) {
    return toolError(
      `Cannot undo delete: node ${deleted.id} is not deleted`,
      "It may already have been restored.",
    );
  }
  try {
    const restored = await restoreNode(client, current.id);
    if (!restored) {
      return toolError(`Cannot undo delete: node ${deleted.id} not found`);
    }
    return { action: "restore", before: current, after: restored };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toolError(
        "Cannot undo delete: restoring this node would duplicate a live origin (system, id)",
        "Search origin to find the live node. Do not twin people. Change or delete the live origin first.",
      );
    }
    throw error;
  }
}

async function invertLink(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const edge = snapshotEdge(row.after);
  if (!edge) {
    return toolError("Link activity is missing an edge snapshot", "This row cannot be undone.");
  }
  const existing = await getEdgeById(client, edge.id);
  if (!existing) {
    return toolError(
      `Cannot undo link: edge ${edge.id} not found`,
      "It may already have been unlinked.",
    );
  }
  const removed = await deleteEdgeById(client, edge.id);
  return { action: "unlink", before: existing, after: removed ?? null };
}

async function invertUnlink(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const edge = snapshotEdge(row.before);
  if (!edge) {
    return toolError("Unlink activity is missing a before edge snapshot", "This row cannot be undone.");
  }
  const existing = await getEdgeById(client, edge.id);
  if (existing) {
    return toolError(`Cannot undo unlink: edge ${edge.id} already exists`);
  }
  try {
    const restored = await restoreEdge(client, edge);
    return { action: "link", before: null, after: restored };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return toolError(
        "Cannot undo unlink: restoring this edge would duplicate a live child_of or exact edge",
        "Unlink the current edge first, or leave the graph as-is.",
      );
    }
    if (isForeignKeyViolation(error)) {
      return toolError(
        "Cannot undo unlink: restoring this edge references a missing relation or node",
        "Restore the relation (or endpoints) first, then retry undo.",
      );
    }
    throw error;
  }
}

async function invertTypeChange(
  client: PoolClient,
  row: Activity,
  options: { purgeDeleted?: boolean } = {},
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const before = row.before == null ? null : snapshotType(row.before);
  const after = row.after == null ? null : snapshotType(row.after);
  if (row.before != null && !before) {
    return toolError("Type change is missing a valid before snapshot", "This row cannot be undone.");
  }
  if (row.after != null && !after) {
    return toolError("Type change is missing a valid after snapshot", "This row cannot be undone.");
  }

  if (before == null && after) {
    const removed = await removeAuthoredType(client, after.slug, {
      purgeDeleted: options.purgeDeleted === true,
      writer: { actor: row.actor, actor_label: row.actor_label },
      purpose: "undo_create",
    });
    if ("error" in removed) {
      return removed;
    }
    return { action: "type_change", before: removed.type, after: null };
  }

  if (before && after == null) {
    const current = await getNodeType(client, before.slug);
    if (current) {
      return toolError(
        `Cannot undo type retire: "${before.slug}" already exists`,
        "The type was recreated. Leave it, or retire the new row first.",
      );
    }
    try {
      const restored = await insertNodeType(client, {
        slug: before.slug,
        label: before.label,
        description: before.description,
        kind: before.kind,
        parent_types: before.parent_types,
        json_schema: before.json_schema,
      });
      return { action: "type_change", before: null, after: restored };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return toolError(
          `Cannot undo type retire: "${before.slug}" already exists`,
          "The type was recreated. Leave it, or retire the new row first.",
        );
      }
      throw error;
    }
  }

  if (before) {
    const current = await getNodeType(client, before.slug);
    if (!current) {
      return toolError(`Cannot undo type update: "${before.slug}" not found`);
    }
    const restored = current.is_system
      ? await updateNodeTypeDescription(client, before.slug, before.description)
      : await updateNodeType(client, before.slug, {
          label: before.label,
          description: before.description,
          kind: before.kind,
          parent_types: before.parent_types,
          json_schema: before.json_schema,
        });
    if (!restored) {
      return toolError(`Cannot undo type update: "${before.slug}" not found`);
    }
    return { action: "type_change", before: current, after: restored };
  }

  return toolError("Type change activity has no snapshots to invert");
}

async function invertRelationChange(
  client: PoolClient,
  row: Activity,
): Promise<{ before: unknown; after: unknown; action: Activity["action"] } | ToolError> {
  const before = row.before == null ? null : snapshotRelation(row.before);
  const after = row.after == null ? null : snapshotRelation(row.after);
  if (row.before != null && !before) {
    return toolError(
      "Relation change is missing a valid before snapshot",
      "This row cannot be undone.",
    );
  }
  if (row.after != null && !after) {
    return toolError(
      "Relation change is missing a valid after snapshot",
      "This row cannot be undone.",
    );
  }

  if (before == null && after) {
    const slug = after.slug;
    const edges = await countEdgesByRelation(client, slug);
    if (edges > 0) {
      return toolError(
        `Cannot undo relation create "${slug}": ${edges} edge(s) still use it`,
        "Unlink those edges first, then retry undo.",
      );
    }
    const children = await countRelationsUsingSemanticParent(client, slug);
    if (children > 0) {
      return toolError(
        `Cannot undo relation create "${slug}": other relations use it as semantic_parent_slug`,
        "Update those relations first, then retry undo.",
      );
    }
    const current = await getRelationType(client, slug);
    if (!current) {
      return toolError(`Cannot undo relation create: "${slug}" is already gone`);
    }
    if (current.is_system) {
      return toolError(`Cannot delete system relation "${slug}"`);
    }
    const removed = await deleteRelationType(client, slug);
    return { action: "relation_change", before: current, after: removed ?? null };
  }

  if (before) {
    const current = await getRelationType(client, before.slug);
    if (!current) {
      return toolError(`Cannot undo relation update: "${before.slug}" not found`);
    }
    const restored = current.is_system
      ? await updateRelationTypeDescription(client, before.slug, before.description)
      : await updateRelationType(client, before.slug, {
          label: before.label,
          description: before.description,
          kind: before.kind,
          source_types: before.source_types,
          target_types: before.target_types,
          is_symmetric: before.is_symmetric,
          semantic_parent_slug: before.semantic_parent_slug,
        });
    if (!restored) {
      return toolError(`Cannot undo relation update: "${before.slug}" not found`);
    }
    return { action: "relation_change", before: current, after: restored };
  }

  return toolError("Relation change activity has no snapshots to invert");
}

export async function undoGraphActivity(
  pool: Pool,
  input: UndoInput,
): Promise<{ ok: true; activity_id: string } | ToolError> {
  const confirmErr = missingConfirm("undo", input.confirm);
  if (confirmErr) {
    return confirmErr;
  }

  return withTransaction(pool, async (client) => {
    const row = await getActivityById(client, input.id, { forUpdate: true });
    if (!row) {
      return toolError(
        `Activity not found: ${input.id}`,
        "Pass an activity id from list_activity or a mutation's activity_id.",
      );
    }
    if (!row.reversible) {
      return toolError(
        "Activity is not reversible",
        "Undo of undo writes a compensating row with reversible = false. Apply a new mutation if you need a different state.",
      );
    }
    if (row.undone_at) {
      return toolError(
        "Activity already undone",
        "Undo tokens are single-use. The compensating row is not reversible.",
      );
    }
    if (expired(row)) {
      return toolError(
        "Undo token expired",
        "The undo window has passed. Recreate or upsert the desired state directly.",
      );
    }

    let inverted: { before: unknown; after: unknown; action: Activity["action"] } | ToolError;
    switch (row.action) {
      case "create":
        inverted = await invertCreateNode(client, row);
        break;
      case "update":
        inverted = await invertUpdateNode(client, row);
        break;
      case "delete":
        inverted = await invertDeleteNode(client, row);
        break;
      case "link":
        inverted = await invertLink(client, row);
        break;
      case "unlink":
        inverted = await invertUnlink(client, row);
        break;
      case "type_change":
        inverted = await invertTypeChange(client, row, {
          purgeDeleted: input.purge_deleted === true,
        });
        break;
      case "relation_change":
        inverted = await invertRelationChange(client, row);
        break;
      case "restore":
        inverted = toolError(
          "Cannot undo a restore row",
          "Delete the node again if you need it gone.",
        );
        break;
      default:
        inverted = toolError(`Cannot invert action "${row.action}"`);
    }
    if ("error" in inverted) {
      return inverted;
    }

    const marked = await markActivityUndone(client, row.id);
    if (!marked) {
      return toolError("Activity already undone", "Undo tokens are single-use.");
    }

    const compensating = await insertActivity(client, {
      actor: input.actor ?? row.actor,
      actor_label: input.actor_label ?? row.actor_label,
      action: inverted.action,
      target_kind: row.target_kind,
      target_id: row.target_id,
      before: inverted.before,
      after: inverted.after,
      reversible: false,
      rationale: `Undo of ${row.id}`,
    });
    return { ok: true as const, activity_id: compensating.id };
  });
}
