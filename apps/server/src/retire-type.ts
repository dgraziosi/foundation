import {
  countDeletedNodesByType,
  countNodesByType,
  countTypesUsingParent,
  deleteNodeType,
  getNodeType,
  insertActivity,
  isForeignKeyViolation,
  markNodeDeleteActivitiesIrreversible,
  purgeDeletedNodesByType,
  type PoolClient,
} from "@foundation/db";
import { toolError, type Activity, type NodeType, type ToolError } from "@foundation/schema";

export type TypeRemovalPurpose = "retire" | "undo_create";

function typeRemovalErrors(slug: string, purpose: TypeRemovalPurpose) {
  if (purpose === "retire") {
    return {
      live: (n: number) =>
        toolError(
          `Cannot retire type "${slug}": ${n} node(s) still use it`,
          "Delete or retype those nodes first, then retry manage_type action retire with confirm: true.",
        ),
      tombstones: (n: number) =>
        toolError(
          `Cannot retire type "${slug}": ${n} deleted node(s) of that type are still restorable`,
          "Undo those deletes to restore the nodes, or retry manage_type action retire with confirm: true and purge_deleted: true to permanently drop the deleted nodes and their edges.",
        ),
      parents: (n: number) =>
        toolError(
          `Cannot retire type "${slug}": other types list it in parent_types`,
          "Update those types first, then retry manage_type action retire.",
        ),
      missing: toolError(
        `Type "${slug}" not found`,
        'Use action: "create" to add it. Call inspect_ontology for current slugs.',
      ),
      system: toolError(
        `Cannot retire system type "${slug}"`,
        "System seed types cannot be retired.",
      ),
      leftover: toolError(
        `Cannot retire type "${slug}": deleted nodes still reference it`,
        "Undo those deletes to restore the nodes, or retry manage_type action retire with confirm: true and purge_deleted: true to permanently drop the deleted nodes and their edges.",
      ),
      rationale: `Purge deleted nodes while retiring type ${slug}`,
    };
  }
  return {
    live: (n: number) =>
      toolError(
        `Cannot undo type create "${slug}": ${n} node(s) still use it`,
        "Delete or retype those nodes first, then retry undo.",
      ),
    tombstones: (n: number) =>
      toolError(
        `Cannot undo type create "${slug}": ${n} deleted node(s) of that type are still restorable`,
        "Undo those deletes to restore the nodes, or retry undo with confirm: true and purge_deleted: true to permanently drop the deleted nodes and their edges.",
      ),
    parents: (n: number) =>
      toolError(
        `Cannot undo type create "${slug}": other types list it in parent_types`,
        "Update those types first, then retry undo.",
      ),
    missing: toolError(`Cannot undo type create: "${slug}" is already gone`),
    system: toolError(`Cannot delete system type "${slug}"`),
    leftover: toolError(
      `Cannot undo type create "${slug}": deleted nodes still reference it`,
      "Undo those deletes to restore the nodes, or retry undo with confirm: true and purge_deleted: true to permanently drop the deleted nodes and their edges.",
    ),
    rationale: `Purge deleted nodes while undoing type create ${slug}`,
  };
}

/** Drop an unused authored type. Same guards as undo-of-type-create. */
export async function removeAuthoredType(
  client: PoolClient,
  slug: string,
  options: {
    purgeDeleted: boolean;
    writer: { actor: Activity["actor"]; actor_label: string | null };
    purpose: TypeRemovalPurpose;
  },
): Promise<{ type: NodeType } | ToolError> {
  const errors = typeRemovalErrors(slug, options.purpose);
  const nodes = await countNodesByType(client, slug);
  if (nodes > 0) {
    return errors.live(nodes);
  }
  const tombstones = await countDeletedNodesByType(client, slug);
  if (tombstones > 0 && !options.purgeDeleted) {
    return errors.tombstones(tombstones);
  }
  const parents = await countTypesUsingParent(client, slug);
  if (parents > 0) {
    return errors.parents(parents);
  }
  const current = await getNodeType(client, slug);
  if (!current) {
    return errors.missing;
  }
  if (current.is_system) {
    return errors.system;
  }
  if (tombstones > 0) {
    const purged = await purgeDeletedNodesByType(client, slug);
    for (const edge of purged.edges) {
      await insertActivity(client, {
        actor: options.writer.actor,
        actor_label: options.writer.actor_label,
        action: "unlink",
        target_kind: "edge",
        target_id: edge.id,
        before: edge,
        after: null,
        reversible: false,
        rationale: errors.rationale,
      });
    }
    await markNodeDeleteActivitiesIrreversible(
      client,
      purged.nodes.map((node) => node.id),
    );
  }
  try {
    const removed = await deleteNodeType(client, slug);
    if (!removed) {
      return errors.missing;
    }
    return { type: removed };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return errors.leftover;
    }
    throw error;
  }
}
