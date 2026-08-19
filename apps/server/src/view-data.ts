import {
  listActivity,
  listEdgesAmong,
  listLiveNodesByIds,
  listRecentLiveNodes,
  listTaskCards,
  type Pool,
} from "@foundation/db";
import {
  dueFromData,
  isToolError,
  isUuid,
  todayInNewYork,
  type Activity,
  type SearchHit,
} from "@foundation/schema";
import { getGraphNode, inspectOntology, searchGraphNodes } from "./graph.js";

const GRAPH_SEED_LIMIT = 48;
const RECENTS_LIMIT = 40;
const HIERARCHY_RELATION = "child_of";

export type ViewGraphNode = {
  id: string;
  title: string;
  type: string;
  status: string;
};

export type ViewGraphEdge = {
  id: string;
  from: string;
  to: string;
  relation_type: string;
  kind: "hierarchy" | "associative";
};

export type ViewRecentRow = {
  id: string;
  action: string;
  summary: string;
  title?: string;
  type?: string;
  node_id?: string;
  created_at: string;
};

export type DueTone = "overdue" | "today" | "future";

export type ViewTaskCard = {
  id: string;
  title: string;
  status: "active" | "completed" | "archived";
  due?: string;
  due_tone?: DueTone;
  parent_title?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function dueTone(due: string, today = todayInNewYork()): DueTone {
  if (due < today) {
    return "overdue";
  }
  if (due === today) {
    return "today";
  }
  return "future";
}

export async function viewOntology(pool: Pool): Promise<{ types: Array<{ slug: string; label: string }> }> {
  const ontology = await inspectOntology(pool, "types");
  return {
    types: ontology.types.map((type) => ({ slug: type.slug, label: type.label })),
  };
}

export async function viewSearch(
  pool: Pool,
  input: { q: string; type: string; status: string },
): Promise<{ searched: boolean; hits: SearchHit[]; error?: string }> {
  const query = input.q.trim();
  const type = input.type.trim();
  const status = input.status.trim();
  const searched = Boolean(query || type || status);
  if (!searched) {
    return { searched: false, hits: [] };
  }
  const result = await searchGraphNodes(pool, {
    query: query || undefined,
    type: type || undefined,
    status:
      status === "active" || status === "completed" || status === "archived" ? status : undefined,
  });
  if (isToolError(result)) {
    return { searched: true, hits: [], error: result.error };
  }
  return { searched: true, hits: result.nodes };
}

export async function viewGraph(
  pool: Pool,
  input: { focus?: string; type?: string },
): Promise<{ nodes: ViewGraphNode[]; edges: ViewGraphEdge[] }> {
  const type = input.type?.trim() || undefined;
  const focus = input.focus && isUuid(input.focus) ? input.focus : undefined;
  const seed = await listRecentLiveNodes(pool, { limit: GRAPH_SEED_LIMIT, type });
  const ids = new Set(seed.map((node) => node.id));

  if (focus) {
    const got = await getGraphNode(pool, focus);
    if (!isToolError(got)) {
      ids.add(got.node.id);
      for (const edge of got.edges) {
        ids.add(edge.neighbor.id);
      }
    }
  }

  const nodes = await listLiveNodesByIds(pool, [...ids]);
  const edges = await listEdgesAmong(
    pool,
    nodes.map((node) => node.id),
  );
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      status: node.status,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: edge.from_id,
      to: edge.to_id,
      relation_type: edge.relation_type,
      kind: edge.relation_type === HIERARCHY_RELATION ? "hierarchy" : "associative",
    })),
  };
}

export async function viewNode(pool: Pool, id: string, dataDir: string) {
  if (!isUuid(id)) {
    return { error: "Not found" as const };
  }
  const got = await getGraphNode(pool, id, { blobs: { dataDir } });
  if (isToolError(got)) {
    return { error: "Not found" as const };
  }
  const due = dueFromData(got.node.data);
  return {
    node: got.node,
    edges: got.edges,
    blob: got.blob,
    suggested_links: got.suggested_links,
    due: due ?? null,
    due_tone: due ? dueTone(due) : null,
  };
}

function collectTitleIds(activity: Activity): string[] {
  const ids: string[] = [];
  if (activity.target_kind === "node" && activity.target_id) {
    ids.push(activity.target_id);
  }
  for (const side of [activity.after, activity.before]) {
    const record = asRecord(side);
    const fromId = stringField(record, "from_id");
    const toId = stringField(record, "to_id");
    if (fromId && isUuid(fromId)) {
      ids.push(fromId);
    }
    if (toId && isUuid(toId)) {
      ids.push(toId);
    }
  }
  return ids;
}

export function presentRecentRow(
  activity: Activity,
  titles: Map<string, { title: string; type: string }>,
): ViewRecentRow {
  const after = asRecord(activity.after);
  const before = asRecord(activity.before);
  const nodeMeta = activity.target_id ? titles.get(activity.target_id) : undefined;
  const title =
    stringField(after, "title") ?? stringField(before, "title") ?? nodeMeta?.title;
  const type = stringField(after, "type") ?? stringField(before, "type") ?? nodeMeta?.type;

  if (activity.action === "link" || activity.action === "unlink") {
    const record = after ?? before;
    const fromId = stringField(record, "from_id");
    const toId = stringField(record, "to_id");
    const fromTitle = fromId ? titles.get(fromId)?.title : undefined;
    const toTitle = toId ? titles.get(toId)?.title : undefined;
    const verb = activity.action === "link" ? "Linked" : "Unlinked";
    const summary =
      fromTitle && toTitle ? `${verb} ${fromTitle} → ${toTitle}` : `${verb} an edge`;
    return {
      id: activity.id,
      action: activity.action,
      summary,
      title: fromTitle,
      type,
      node_id: fromId && isUuid(fromId) ? fromId : undefined,
      created_at: activity.created_at,
    };
  }

  return {
    id: activity.id,
    action: activity.action,
    summary: title ?? activity.action,
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
    ...(activity.target_kind === "node" && activity.target_id ? { node_id: activity.target_id } : {}),
    created_at: activity.created_at,
  };
}

export async function viewRecents(pool: Pool): Promise<{ rows: ViewRecentRow[] }> {
  const activities = await listActivity(pool, { limit: RECENTS_LIMIT });
  const ids = [...new Set(activities.flatMap(collectTitleIds))];
  const nodes = await listLiveNodesByIds(pool, ids);
  const titles = new Map(nodes.map((node) => [node.id, { title: node.title, type: node.type }]));
  for (const activity of activities) {
    const after = asRecord(activity.after);
    const before = asRecord(activity.before);
    const title = stringField(after, "title") ?? stringField(before, "title");
    const type = stringField(after, "type") ?? stringField(before, "type");
    if (activity.target_kind === "node" && activity.target_id && title && !titles.has(activity.target_id)) {
      titles.set(activity.target_id, { title, type: type ?? "node" });
    }
  }
  return { rows: activities.map((activity) => presentRecentRow(activity, titles)) };
}

export async function viewTasks(pool: Pool): Promise<{ tasks: ViewTaskCard[] }> {
  const today = todayInNewYork();
  const rows = await listTaskCards(pool);
  return {
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      ...(row.due ? { due: row.due, due_tone: dueTone(row.due, today) } : {}),
      ...(row.parent_title ? { parent_title: row.parent_title } : {}),
    })),
  };
}

