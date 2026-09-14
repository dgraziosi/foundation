import {
  getActivityById,
  getNodeById,
  insertActivity,
  listActivity,
  listDeletedNodes,
  restoreNode,
  UNDO_TTL_MS,
  withTransaction,
  type Pool,
} from "@foundation/db";
import {
  activitySnapshotDiff,
  assertIfMatch,
  isToolError,
  NodeStatusSchema,
  toolError,
  type Activity,
  type Node,
  type NodeStatus,
  type TypeField,
} from "@foundation/schema";
import { deleteGraphNode, upsertGraphNode } from "./graph.js";
import { undoGraphActivity } from "./undo.js";
import { viewNode } from "./view-data.js";
import { VIEWER_WRITER, viewJournalWrite } from "./view-journal.js";
import { DESTRUCTIVE, type WriteContext } from "./write-context.js";

const VIEWER_WRITE: WriteContext = { ...DESTRUCTIVE, writer: VIEWER_WRITER };

const NODE_UNDO_ACTIONS = new Set(["create", "update", "delete", "restore"]);

export type ViewNodePatch = {
  id: string;
  title?: string;
  status?: string;
  data?: Record<string, unknown>;
  body?: string;
  base_updated_at: string;
};

export type ViewActivityRow = {
  id: string;
  action: string;
  actor: string;
  actor_label: string | null;
  created_at: string;
  summary: string;
  reversible: boolean;
  can_undo: boolean;
  base_updated_at?: string;
};

export type ViewTrashRow = {
  id: string;
  type: string;
  title: string;
  deleted_at: string;
  updated_at: string;
};

export function isEditableTypeField(field: TypeField): boolean {
  return field.kind === "string" || field.kind === "date" || field.kind === "number" || field.kind === "enum";
}

export function pickEditableData(
  fields: readonly TypeField[],
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }
  const allowed = new Set(fields.filter(isEditableTypeField).map((field) => field.name));
  const next: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(data)) {
    if (allowed.has(name)) {
      next[name] = value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function snapshotTitle(value: unknown): string | undefined {
  const title = asRecord(value)?.title;
  return typeof title === "string" ? title : undefined;
}

function snapshotStatus(value: unknown): string | undefined {
  const status = asRecord(value)?.status;
  return typeof status === "string" ? status : undefined;
}

function snapshotData(value: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(value)?.data);
}

export function activityChangeSummary(row: Pick<Activity, "action" | "before" | "after">): string {
  if (row.action === "create") {
    return "Created";
  }
  if (row.action === "delete") {
    return "Moved to trash";
  }
  if (row.action === "restore") {
    return "Restored";
  }
  if (row.action !== "update") {
    return row.action.replaceAll("_", " ");
  }
  const changed: string[] = [];
  const beforeTitle = snapshotTitle(row.before);
  const afterTitle = snapshotTitle(row.after);
  if (beforeTitle !== afterTitle) {
    changed.push("title");
  }
  const beforeStatus = snapshotStatus(row.before);
  const afterStatus = snapshotStatus(row.after);
  if (beforeStatus !== afterStatus) {
    changed.push("status");
  }
  const dataDiff = activitySnapshotDiff(snapshotData(row.before) ?? {}, snapshotData(row.after) ?? {});
  const dataBefore = asRecord(dataDiff.before) ?? {};
  const dataAfter = asRecord(dataDiff.after) ?? {};
  for (const key of [...Object.keys(dataBefore), ...Object.keys(dataAfter)]) {
    const label = `data.${key}`;
    if (!changed.includes(label)) {
      changed.push(label);
    }
  }
  return changed.length > 0 ? changed.join(", ") : "Updated";
}

function undoExpired(row: Activity, now = Date.now()): boolean {
  if (row.token_expires_at) {
    return Date.parse(row.token_expires_at) <= now;
  }
  if (!row.reversible || !row.created_at) {
    return false;
  }
  return Date.parse(row.created_at) + UNDO_TTL_MS <= now;
}

function nodeUndoIfMatch(row: Activity, live: Node | undefined): string | undefined {
  if (!NODE_UNDO_ACTIONS.has(row.action)) {
    return undefined;
  }
  if (row.action === "delete") {
    const stamp = asRecord(row.before)?.updated_at;
    return typeof stamp === "string" ? stamp : undefined;
  }
  return live?.updated_at;
}

export function presentViewActivity(row: Activity, live: Node | undefined): ViewActivityRow {
  const expired = undoExpired(row);
  const base = nodeUndoIfMatch(row, live);
  const canUndo =
    row.reversible === true &&
    !row.undone_at &&
    !expired &&
    NODE_UNDO_ACTIONS.has(row.action) &&
    typeof base === "string" &&
    base.length > 0;
  return {
    id: row.id,
    action: row.action,
    actor: row.actor,
    actor_label: row.actor_label,
    created_at: row.created_at,
    summary: activityChangeSummary(row),
    reversible: row.reversible === true && !row.undone_at && !expired,
    can_undo: canUndo,
    ...(canUndo ? { base_updated_at: base } : {}),
  };
}

export async function viewNodeWrite(pool: Pool, dataDir: string, input: ViewNodePatch) {
  const current = await viewNode(pool, input.id, dataDir);
  if ("error" in current) {
    return current;
  }
  if (typeof input.body === "string") {
    if (current.node.type !== "journal") {
      return { error: "Journal writes only.", suggestion: "Open a journal record to edit the body." };
    }
    return viewJournalWrite(pool, dataDir, {
      id: input.id,
      title: input.title ?? current.node.title,
      body: input.body,
      base_updated_at: input.base_updated_at,
    });
  }
  const title = (input.title ?? current.node.title).trim();
  if (!title) {
    return { error: "Title is required.", suggestion: "Keep a title." };
  }
  let status: NodeStatus | undefined;
  if (input.status !== undefined) {
    const parsed = NodeStatusSchema.safeParse(input.status);
    if (!parsed.success) {
      return { error: "Status must be active, completed, or archived.", suggestion: "Pick a listed status." };
    }
    status = parsed.data;
  }
  const fields = current.type?.fields ?? [];
  const data = pickEditableData(fields, input.data);
  const written = await upsertGraphNode(
    pool,
    {
      id: input.id,
      type: current.node.type,
      title,
      ...(status ? { status } : {}),
      ...(data ? { data } : {}),
      base_updated_at: input.base_updated_at,
    },
    { dataDir },
    { writer: VIEWER_WRITER },
  );
  if (isToolError(written)) {
    return written;
  }
  return viewNode(pool, written.node.id, dataDir);
}

export async function viewNodeActivity(pool: Pool, id: string) {
  const live = await getNodeById(pool, id, { includeDeleted: true });
  if (!live) {
    return { error: "Not found", suggestion: "Open a live record." };
  }
  const page = await listActivity(pool, { target: id, limit: 50 });
  return { rows: page.activities.map((row) => presentViewActivity(row, live.deleted_at ? undefined : live)) };
}

export async function viewUndoActivity(
  pool: Pool,
  dataDir: string,
  input: { id: string; base_updated_at: string },
) {
  const row = await getActivityById(pool, input.id);
  if (!row) {
    return { error: "Not found", suggestion: "Open activity for this record and try again." };
  }
  const undone = await undoGraphActivity(
    pool,
    { id: input.id, base_updated_at: input.base_updated_at },
    VIEWER_WRITE,
  );
  if (isToolError(undone)) {
    return undone;
  }
  const target = row.target_id;
  if (!target) {
    return { ok: true as const, activity_id: undone.activity_id };
  }
  const detail = await viewNode(pool, target, dataDir);
  if ("error" in detail) {
    return { ok: true as const, activity_id: undone.activity_id };
  }
  return { ok: true as const, activity_id: undone.activity_id, ...detail };
}

export async function viewNodeDelete(
  pool: Pool,
  input: { id: string; base_updated_at: string },
) {
  const removed = await deleteGraphNode(
    pool,
    { id: input.id, base_updated_at: input.base_updated_at },
    VIEWER_WRITE,
  );
  if (isToolError(removed)) {
    return removed;
  }
  return { ok: true as const, activity_id: removed.activity_id };
}

export async function viewTrash(pool: Pool) {
  const nodes = await listDeletedNodes(pool, { limit: 200 });
  const rows: ViewTrashRow[] = nodes
    .filter((node) => typeof node.deleted_at === "string" && node.deleted_at.length > 0)
    .map((node) => ({
      id: node.id,
      type: node.type,
      title: node.title,
      deleted_at: node.deleted_at as string,
      updated_at: node.updated_at,
    }));
  return { rows };
}

async function restoreWithoutToken(pool: Pool, node: Node) {
  return withTransaction(pool, async (client) => {
    const current = await getNodeById(client, node.id, { includeDeleted: true, forUpdate: true });
    if (!current?.deleted_at) {
      return toolError("Not found", "This record is not in trash.");
    }
    const restored = await restoreNode(client, current.id);
    if (!restored) {
      return toolError("Not found", "This record is not in trash.");
    }
    const activity = await insertActivity(client, {
      ...VIEWER_WRITER,
      action: "restore",
      target_kind: "node",
      target_id: restored.id,
      before: current,
      after: restored,
    });
    return { ok: true as const, activity_id: activity.id, node: restored };
  });
}

export async function viewNodeRestore(
  pool: Pool,
  dataDir: string,
  input: { id: string; base_updated_at: string },
) {
  const current = await getNodeById(pool, input.id, { includeDeleted: true });
  if (!current?.deleted_at) {
    return { error: "Not found", suggestion: "Open Trash for a soft-deleted record." };
  }
  const stale = assertIfMatch("base_updated_at", input.base_updated_at, current.updated_at);
  if (stale) {
    return stale;
  }
  const page = await listActivity(pool, { target: input.id, action: "delete", limit: 20 });
  const reversibleDelete = page.activities.find(
    (row) => row.reversible && !row.undone_at && !undoExpired(row),
  );
  if (reversibleDelete) {
    const beforeStamp = asRecord(reversibleDelete.before)?.updated_at;
    const undone = await undoGraphActivity(
      pool,
      {
        id: reversibleDelete.id,
        base_updated_at: typeof beforeStamp === "string" ? beforeStamp : input.base_updated_at,
      },
      VIEWER_WRITE,
    );
    if (isToolError(undone)) {
      return undone;
    }
    return viewNode(pool, input.id, dataDir);
  }
  const restored = await restoreWithoutToken(pool, current);
  if (isToolError(restored)) {
    return restored;
  }
  return viewNode(pool, input.id, dataDir);
}

