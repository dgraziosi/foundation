import {
  countLiveNodesGroupedByType,
  getNodeType,
  listActivity,
  listEdgesAmong,
  listLiveNodesByIds,
  listOutlineChildren,
  listRecentLiveNodes,
  getNodeById,
  listTaskCards,
  listTypeCards,
  type Pool,
} from "@foundation/db";
import {
  applyViewQuery,
  asViewDeclarations,
  collectionAxisDate,
  collectionChips,
  collectionLabel,
  dateValueFromData,
  fieldByRole,
  findViewDeclaration,
  isToolError,
  isUuid,
  resolveTypeViews,
  todayInNewYork,
  type Activity,
  type SearchHit,
  type TypeField,
  type ViewDeclaration,
  type ViewEngineId,
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

export type ViewOntologyType = {
  slug: string;
  label: string;
  views: ViewEngineId[];
  default_view?: ViewEngineId;
  count: number;
};

export async function viewOntology(pool: Pool): Promise<{ types: ViewOntologyType[] }> {
  const ontology = await inspectOntology(pool, "types");
  const counts = await countLiveNodesGroupedByType(pool);
  return {
    types: ontology.types.map((type) => {
      const resolved = resolveTypeViews(type);
      return {
        slug: type.slug,
        label: type.label,
        views: resolved.views,
        ...(resolved.defaultView ? { default_view: resolved.defaultView } : {}),
        count: counts.get(type.slug) ?? 0,
      };
    }),
  };
}

export type ViewTypeChip = { name: string; display: string; value: string };

export type ViewTypeNode = {
  id: string;
  title: string;
  type: string;
  status: "active" | "completed" | "archived";
  due?: string;
  due_tone?: DueTone;
  parent_id?: string;
  parent_title?: string;
  chips?: ViewTypeChip[];
  data?: Record<string, unknown>;
  updated_at?: string;
};

function asQueryNode(row: {
  id: string;
  title: string;
  status: "active" | "completed" | "archived";
  data?: Record<string, unknown>;
  updated_at?: string;
}) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    data: row.data ?? {},
    updated_at: row.updated_at ?? "",
  };
}

function presentTypeCard(
  row: {
    id: string;
    title: string;
    type?: string;
    status: "active" | "completed" | "archived";
    due: string | null;
    parent_id?: string | null;
    parent_title: string | null;
    data?: Record<string, unknown>;
    updated_at?: string;
  },
  fields: TypeField[],
  today: string,
): ViewTypeNode {
  const queryNode = asQueryNode(row);
  const axis = collectionAxisDate(queryNode, fields);
  const chips = collectionChips(queryNode, fields);
  return {
    id: row.id,
    title: collectionLabel(queryNode, fields),
    type: row.type ?? "task",
    status: row.status,
    chips,
    data: queryNode.data,
    updated_at: queryNode.updated_at,
    ...(axis ? { due: axis, due_tone: dueTone(axis, today) } : {}),
    ...(row.parent_id ? { parent_id: row.parent_id } : {}),
    ...(row.parent_title ? { parent_title: row.parent_title } : {}),
  };
}

export async function viewType(
  pool: Pool,
  slug: string,
): Promise<
  | {
      type: {
        slug: string;
        label: string;
        views: ViewDeclaration[];
        default_view?: ViewEngineId;
        fields: TypeField[];
      };
      nodes: ViewTypeNode[];
      children: ViewTypeNode[];
    }
  | { error: "Not found" }
> {
  const type = await getNodeType(pool, slug);
  if (!type) {
    return { error: "Not found" };
  }
  const today = todayInNewYork();
  const fields = type.fields ?? [];
  const declarations = asViewDeclarations(type.views);
  const rows = await listTypeCards(pool, slug);
  const nodes = rows.map((row) => presentTypeCard(row, fields, today));
  const children = (await listOutlineChildren(pool, nodes.map((node) => node.id))).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    parent_id: row.parent_id,
  }));
  return {
    type: {
      slug: type.slug,
      label: type.label,
      views: declarations,
      fields,
      ...(type.default_view ? { default_view: type.default_view } : {}),
    },
    nodes,
    children,
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
  const type = await getNodeType(pool, got.node.type);
  const fields = type?.fields ?? [];
  const dateField = fieldByRole(fields, "date") ?? fieldByRole(fields, "start");
  const due = dateField ? dateValueFromData(got.node.data, dateField.name) : undefined;
  const resolved_refs: Record<string, { id: string; title: string; type: string }> = {};
  for (const field of fields.filter((entry) => entry.kind === "ref")) {
    const value = got.node.data[field.name];
    if (typeof value !== "string" || !isUuid(value)) {
      continue;
    }
    const target = await getNodeById(pool, value);
    if (target) {
      resolved_refs[field.name] = { id: target.id, title: target.title, type: target.type };
    }
  }
  return {
    node: got.node,
    type: type
      ? {
          slug: type.slug,
          label: type.label,
          fields,
        }
      : null,
    edges: got.edges,
    blob: got.blob,
    suggested_links: got.suggested_links,
    resolved_refs,
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
  const type = await getNodeType(pool, "task");
  const fields = type?.fields ?? [];
  const view =
    findViewDeclaration(type?.views, type?.default_view ?? "board") ??
    asViewDeclarations(type?.views)[0] ??
    { id: "board" as const };
  const rows = await listTaskCards(pool);
  const queried = applyViewQuery(
    rows.map((row) => asQueryNode(row)),
    view,
    fields,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    tasks: queried.flatMap((item) => {
      const row = byId.get(item.id);
      if (!row) {
        return [];
      }
      const card = presentTypeCard(row, fields, today);
      return [
        {
          id: card.id,
          title: card.title,
          status: card.status,
          ...(card.due ? { due: card.due, due_tone: card.due_tone } : {}),
          ...(card.parent_title ? { parent_title: card.parent_title } : {}),
        },
      ];
    }),
  };
}

