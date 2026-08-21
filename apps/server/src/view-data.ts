import {
  countLiveNodesGroupedByType,
  getNodeType,
  listEdgesAmong,
  listEdgesTouching,
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
  type SearchHit,
  type TypeField,
  type ViewDeclaration,
  type ViewEngineId,
} from "@foundation/schema";
import { getGraphNode, inspectOntology, searchGraphNodes } from "./graph.js";

const RECENTS_PAGE_LIMIT = 500;
const TASKS_PAGE_LIMIT = 200;
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
  title: string;
  type: string;
  updated_at: string;
};

export type RecencyGroup = "Today" | "Yesterday" | "Earlier this week" | "Earlier";

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}

function mondayOfWeek(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  const weekday = (date.getUTCDay() + 6) % 7;
  return shiftIsoDate(iso, -weekday);
}

export function recencyGroup(iso: string, now = new Date()): RecencyGroup {
  const today = todayInNewYork(now);
  const day = todayInNewYork(new Date(iso));
  if (day === today) {
    return "Today";
  }
  if (day === shiftIsoDate(today, -1)) {
    return "Yesterday";
  }
  const monday = mondayOfWeek(today);
  if (day >= monday && day < today) {
    return "Earlier this week";
  }
  return "Earlier";
}

export type TaskDueGroup = "Overdue" | "Today" | "Upcoming" | "No date";

/** Closest-first walk → root → parent for Structure and Location. */
export function rootToParent<T>(closestFirst: readonly T[]): T[] {
  return closestFirst.slice().reverse();
}

export function taskDueGroup(due: string | undefined, today = todayInNewYork()): TaskDueGroup {
  if (!due) {
    return "No date";
  }
  if (due < today) {
    return "Overdue";
  }
  if (due === today) {
    return "Today";
  }
  return "Upcoming";
}

const TASK_DUE_GROUP_RANK: Record<TaskDueGroup, number> = {
  Overdue: 0,
  Today: 1,
  Upcoming: 2,
  "No date": 3,
};

/** Overdue (oldest due first), today, upcoming (soonest first), then undated by title. */
export function compareOpenTasks(
  a: { title: string; due?: string },
  b: { title: string; due?: string },
  today = todayInNewYork(),
): number {
  const leftGroup = taskDueGroup(a.due, today);
  const rightGroup = taskDueGroup(b.due, today);
  if (leftGroup !== rightGroup) {
    return TASK_DUE_GROUP_RANK[leftGroup] - TASK_DUE_GROUP_RANK[rightGroup];
  }
  if (a.due && b.due && a.due !== b.due) {
    return a.due < b.due ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

export type DueTone = "overdue" | "today" | "future";

export type ViewTaskCard = {
  id: string;
  title: string;
  status: "active" | "completed" | "archived";
  due?: string;
  due_tone?: DueTone;
  parent_title?: string;
};

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
  hue?: string;
  glyph?: string;
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
        ...(type.hue ? { hue: type.hue } : {}),
        ...(type.glyph ? { glyph: type.glyph } : {}),
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
        hue?: string;
        glyph?: string;
        parent_types: string[];
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
      parent_types: type.parent_types,
      ...(type.default_view ? { default_view: type.default_view } : {}),
      ...(type.hue ? { hue: type.hue } : {}),
      ...(type.glyph ? { glyph: type.glyph } : {}),
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
  input: { focus?: string; type?: string; depth?: number },
): Promise<{ nodes: ViewGraphNode[]; edges: ViewGraphEdge[] }> {
  const type = input.type?.trim() || undefined;
  const focus = input.focus && isUuid(input.focus) ? input.focus : undefined;
  const depthRaw = input.depth;
  const depth =
    focus && Number.isFinite(depthRaw) ? Math.min(4, Math.max(1, Math.floor(depthRaw as number))) : undefined;

  let ids = new Set<string>();
  if (focus && depth) {
    ids.add(focus);
    let frontier = [focus];
    for (let hop = 0; hop < depth; hop += 1) {
      const touching = await listEdgesTouching(pool, frontier);
      const next: string[] = [];
      for (const edge of touching) {
        for (const id of [edge.from_id, edge.to_id]) {
          if (!ids.has(id)) {
            ids.add(id);
            next.push(id);
          }
        }
      }
      if (next.length === 0) {
        break;
      }
      frontier = next;
    }
  } else {
    const seed = await listRecentLiveNodes(pool, { limit: null, type });
    ids = new Set(seed.map((node) => node.id));
    if (type) {
      const touching = await listEdgesTouching(pool, [...ids]);
      for (const edge of touching) {
        ids.add(edge.from_id);
        ids.add(edge.to_id);
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
  const ancestors: Array<{ id: string; title: string; type: string }> = [];
  let walk: string | undefined = got.edges.find(
    (edge) => edge.relation_type === HIERARCHY_RELATION && edge.direction === "out",
  )?.neighbor.id;
  const seen = new Set<string>([got.node.id]);
  while (walk && !seen.has(walk)) {
    seen.add(walk);
    const parent = await getGraphNode(pool, walk);
    if (isToolError(parent)) {
      break;
    }
    ancestors.push({ id: parent.node.id, title: parent.node.title, type: parent.node.type });
    walk = parent.edges.find(
      (edge) => edge.relation_type === HIERARCHY_RELATION && edge.direction === "out",
    )?.neighbor.id;
  }
  const orderedAncestors = rootToParent(ancestors);
  const childRows = await listOutlineChildren(pool, [got.node.id]);
  const children = childRows
    .filter((row) => row.parent_id === got.node.id)
    .map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      parent_id: row.parent_id,
    }));
  const related: Array<{
    relation_type: string;
    direction: "in" | "out";
    neighbor: { id: string; title: string; type: string };
  }> = got.edges.map((edge) => ({
    relation_type: edge.relation_type,
    direction: edge.direction,
    neighbor: edge.neighbor,
  }));
  return {
    node: got.node,
    type: type
      ? {
          slug: type.slug,
          label: type.label,
          fields,
          parent_types: type.parent_types,
          ...(type.hue ? { hue: type.hue } : {}),
          ...(type.glyph ? { glyph: type.glyph } : {}),
        }
      : null,
    edges: got.edges,
    related,
    ancestors: orderedAncestors,
    children,
    blob: got.blob,
    suggested_links: got.suggested_links,
    resolved_refs,
    due: due ?? null,
    due_tone: due ? dueTone(due) : null,
  };
}

export async function viewRecents(
  pool: Pool,
  input: { limit?: number } = {},
): Promise<{ rows: ViewRecentRow[] }> {
  const limit = input.limit === undefined ? RECENTS_PAGE_LIMIT : Math.min(Math.max(input.limit, 1), RECENTS_PAGE_LIMIT);
  const nodes = await listRecentLiveNodes(pool, { limit, excludeType: "task" });
  return {
    rows: nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      updated_at: node.updated_at,
    })),
  };
}

export async function viewTasks(
  pool: Pool,
  input: { limit?: number } = {},
): Promise<{ tasks: ViewTaskCard[] }> {
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
  const tasks = queried
    .flatMap((item) => {
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
    })
    .sort((left, right) => compareOpenTasks(left, right, today));
  const limit =
    input.limit === undefined
      ? undefined
      : Math.min(Math.max(Math.floor(input.limit), 1), TASKS_PAGE_LIMIT);
  return { tasks: limit ? tasks.slice(0, limit) : tasks };
}

