import type { TypeField } from "./fields.js";
import { dateValueFromData, fieldByRole } from "./fields.js";

/** Closed view-engine set. A type picks from this list; Viewer does not invent a ninth. */
export const VIEW_ENGINE_IDS = [
  "list",
  "card",
  "table",
  "board",
  "calendar",
  "timeline",
  "outline",
  "graph",
] as const;

export type ViewEngineId = (typeof VIEW_ENGINE_IDS)[number];

export const VIEW_ENGINE_ID_SET = new Set<string>(VIEW_ENGINE_IDS);

export function isViewEngineId(value: string): value is ViewEngineId {
  return VIEW_ENGINE_ID_SET.has(value);
}

export const VIEW_BINDS = ["title", "status", "date", "start", "end", "subtitle", "updated_at"] as const;
export type ViewBind = (typeof VIEW_BINDS)[number];

export const VIEW_FILTER_OPS = ["eq", "in"] as const;
export type ViewFilterOp = (typeof VIEW_FILTER_OPS)[number];

export type ViewFilterClause = {
  bind: ViewBind;
  op: ViewFilterOp;
  value: string | string[];
};

export type ViewFilter = {
  clauses: ViewFilterClause[];
};

export type ViewSortKey = {
  bind: ViewBind;
  dir: "asc" | "desc";
};

export type ViewGroup = {
  bind: ViewBind;
};

export type ViewDeclaration = {
  id: ViewEngineId;
  filter?: ViewFilter;
  sort?: ViewSortKey[];
  group?: ViewGroup;
};

export const VIEWS_SUGGESTION =
  "views is an ordered array of view declarations { id, filter?, sort?, group? } (or bare ids). id is list, card, table, board, calendar, timeline, outline, or graph. default_view must be one of those ids. Omit default_view when views is empty.";

export type ResolvedTypeViews = {
  views: ViewEngineId[];
  defaultView?: ViewEngineId;
  declarations: ViewDeclaration[];
};

export function viewIds(views: readonly (string | ViewDeclaration)[] | null | undefined): ViewEngineId[] {
  return (views ?? [])
    .map((item) => (typeof item === "string" ? item : item.id))
    .filter(isViewEngineId);
}

export function asViewDeclarations(
  views: readonly (string | ViewDeclaration)[] | null | undefined,
): ViewDeclaration[] {
  if (!views) {
    return [];
  }
  const out: ViewDeclaration[] = [];
  for (const item of views) {
    if (typeof item === "string") {
      if (isViewEngineId(item)) {
        out.push({ id: item });
      }
      continue;
    }
    if (item && isViewEngineId(item.id)) {
      out.push(item);
    }
  }
  return out;
}

export function findViewDeclaration(
  views: readonly (string | ViewDeclaration)[] | null | undefined,
  id: string,
): ViewDeclaration | undefined {
  return asViewDeclarations(views).find((view) => view.id === id);
}

function isViewBind(value: string): value is ViewBind {
  return (VIEW_BINDS as readonly string[]).includes(value);
}

function parseFilter(raw: unknown): ViewFilter | { error: string } {
  if (raw === undefined || raw === null) {
    return { clauses: [] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "filter must be an object with clauses" };
  }
  const clausesRaw = (raw as { clauses?: unknown }).clauses;
  if (clausesRaw === undefined) {
    return { clauses: [] };
  }
  if (!Array.isArray(clausesRaw)) {
    return { error: "filter.clauses must be an array" };
  }
  const clauses: ViewFilterClause[] = [];
  for (const item of clausesRaw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { error: "filter clause must be an object" };
    }
    const clause = item as Record<string, unknown>;
    if (typeof clause.bind !== "string" || !isViewBind(clause.bind)) {
      return { error: "filter bind must be title, status, date, start, end, subtitle, or updated_at" };
    }
    if (clause.op !== "eq" && clause.op !== "in") {
      return { error: "filter op must be eq or in" };
    }
    if (typeof clause.value !== "string" && !Array.isArray(clause.value)) {
      return { error: "filter value must be a string or string array" };
    }
    if (Array.isArray(clause.value) && clause.value.some((entry) => typeof entry !== "string")) {
      return { error: "filter value array must be strings" };
    }
    clauses.push({ bind: clause.bind, op: clause.op, value: clause.value as string | string[] });
  }
  return { clauses };
}

function parseSort(raw: unknown): ViewSortKey[] | { error: string } {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return { error: "sort must be an array" };
  }
  const keys: ViewSortKey[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { error: "sort key must be an object" };
    }
    const key = item as Record<string, unknown>;
    if (typeof key.bind !== "string" || !isViewBind(key.bind)) {
      return { error: "sort bind must be title, status, date, start, end, subtitle, or updated_at" };
    }
    if (key.dir !== "asc" && key.dir !== "desc") {
      return { error: "sort dir must be asc or desc" };
    }
    keys.push({ bind: key.bind, dir: key.dir });
  }
  return keys;
}

function parseGroup(raw: unknown): ViewGroup | undefined | { error: string } {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "group must be an object" };
  }
  const bind = (raw as { bind?: unknown }).bind;
  if (typeof bind !== "string" || !isViewBind(bind)) {
    return { error: "group bind must be title, status, date, start, end, subtitle, or updated_at" };
  }
  return { bind };
}

function parseOneDeclaration(item: unknown): ViewDeclaration | { error: string } {
  if (typeof item === "string") {
    if (!isViewEngineId(item)) {
      return { error: `Unknown view id: ${item}` };
    }
    return { id: item };
  }
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return { error: "views items must be view ids or declarations" };
  }
  const raw = item as Record<string, unknown>;
  if (typeof raw.id !== "string" || !isViewEngineId(raw.id)) {
    return { error: raw.id === undefined ? "view declaration needs id" : `Unknown view id: ${String(raw.id)}` };
  }
  const filter = parseFilter(raw.filter);
  if ("error" in filter) {
    return filter;
  }
  const sort = parseSort(raw.sort);
  if ("error" in sort) {
    return sort;
  }
  const group = parseGroup(raw.group);
  if (group && "error" in group) {
    return group;
  }
  return {
    id: raw.id,
    ...(filter.clauses.length > 0 ? { filter } : {}),
    ...(sort.length > 0 ? { sort } : {}),
    ...(group ? { group } : {}),
  };
}

/** Drop unknown ids. If default_view is missing or not remaining, use the first remaining id. */
export function resolveTypeViews(input: {
  views?: readonly (string | ViewDeclaration)[] | null;
  default_view?: string | null;
}): ResolvedTypeViews {
  const declarations = asViewDeclarations(input.views);
  const views = declarations.map((item) => item.id);
  if (views.length === 0) {
    return { views: [], declarations: [] };
  }
  const declared = input.default_view;
  const defaultView =
    declared && views.includes(declared as ViewEngineId) ? (declared as ViewEngineId) : views[0];
  return { views, defaultView, declarations };
}

export type ParsedTypeViews =
  | { ok: true; views: ViewDeclaration[]; default_view?: ViewEngineId }
  | { ok: false; error: string; suggestion: string };

export function parseTypeViewsInput(input: {
  views?: unknown;
  default_view?: unknown;
}): ParsedTypeViews {
  if (input.views === undefined) {
    if (input.default_view === undefined) {
      return { ok: true, views: [] };
    }
    return { ok: false, error: "default_view requires views", suggestion: VIEWS_SUGGESTION };
  }
  if (!Array.isArray(input.views)) {
    return { ok: false, error: "views must be an array of view ids or declarations", suggestion: VIEWS_SUGGESTION };
  }
  const views: ViewDeclaration[] = [];
  for (const item of input.views) {
    const parsed = parseOneDeclaration(item);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error, suggestion: VIEWS_SUGGESTION };
    }
    views.push(parsed);
  }
  if (input.default_view === undefined || input.default_view === null) {
    return { ok: true, views };
  }
  if (typeof input.default_view !== "string") {
    return { ok: false, error: "default_view must be a view id", suggestion: VIEWS_SUGGESTION };
  }
  if (views.length === 0) {
    return {
      ok: false,
      error: "default_view requires a non-empty views array",
      suggestion: VIEWS_SUGGESTION,
    };
  }
  const ids = views.map((view) => view.id);
  if (!ids.includes(input.default_view as ViewEngineId)) {
    return {
      ok: false,
      error: "default_view must be a member of views",
      suggestion: VIEWS_SUGGESTION,
    };
  }
  return { ok: true, views, default_view: input.default_view as ViewEngineId };
}

/**
 * Update merge: resolve default against the views being written, not the stored
 * default. An omitted default falls back to the first remaining id. Empty views
 * clear default_view. An explicit default still has to be a member of views.
 */
export function mergeTypeViewsPatch(
  existing: {
    views?: readonly (string | ViewDeclaration)[] | null;
    default_view?: string | null;
  },
  patch: { views?: unknown; default_view?: unknown },
): ParsedTypeViews {
  if (patch.views === undefined && patch.default_view === undefined) {
    const resolved = resolveTypeViews(existing);
    return {
      ok: true,
      views: resolved.declarations,
      ...(resolved.defaultView ? { default_view: resolved.defaultView } : {}),
    };
  }
  const viewsInput = patch.views !== undefined ? patch.views : asViewDeclarations(existing.views);
  const parsed =
    patch.default_view !== undefined
      ? parseTypeViewsInput({ views: viewsInput, default_view: patch.default_view })
      : parseTypeViewsInput({ views: viewsInput });
  if (!parsed.ok) {
    return parsed;
  }
  const views = keepExistingQueryOnBareViewIds(existing.views, patch.views, parsed.views);
  if (patch.default_view !== undefined) {
    return { ...parsed, views };
  }
  const resolved = resolveTypeViews({ views });
  return {
    ok: true,
    views: resolved.declarations,
    ...(resolved.defaultView ? { default_view: resolved.defaultView } : {}),
  };
}

/** Bare string ids restate membership/order. Only a declaration object replaces the query. */
function keepExistingQueryOnBareViewIds(
  existing: readonly (string | ViewDeclaration)[] | null | undefined,
  patchViews: unknown,
  parsed: ViewDeclaration[],
): ViewDeclaration[] {
  if (!Array.isArray(patchViews)) {
    return parsed;
  }
  const existingById = new Map(asViewDeclarations(existing).map((view) => [view.id, view]));
  return parsed.map((view, index) => {
    const raw = patchViews[index];
    if (typeof raw !== "string") {
      return view;
    }
    return existingById.get(view.id) ?? view;
  });
}

export function sameViewIds(
  a: readonly (string | ViewDeclaration)[] | null | undefined,
  b: readonly (string | ViewDeclaration)[] | null | undefined,
): boolean {
  const left = viewIds(a);
  const right = viewIds(b);
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Bare `{ id }` only — restyle leftover. Seed apply may fill the query once. */
export function isBareViewDeclaration(view: ViewDeclaration): boolean {
  return view.filter === undefined && view.sort === undefined && view.group === undefined;
}

export function mergeMissingViewIds(
  existing: readonly ViewDeclaration[],
  seed: readonly ViewDeclaration[],
): ViewDeclaration[] {
  const have = new Set(existing.map((view) => view.id));
  const next = existing.map((view) => {
    if (!isBareViewDeclaration(view)) {
      return view;
    }
    const painted = seed.find((item) => item.id === view.id);
    return painted ?? view;
  });
  for (const view of seed) {
    if (!have.has(view.id)) {
      next.push(view);
      have.add(view.id);
    }
  }
  return next;
}

export type QueryNode = {
  id: string;
  title: string;
  status: string;
  data: Record<string, unknown>;
  updated_at?: string;
};

export function calendarAxisRole(fields: readonly TypeField[]): "date" | "start" | null {
  if (fieldByRole(fields, "date")) {
    return "date";
  }
  if (fieldByRole(fields, "start")) {
    return "start";
  }
  return null;
}

function bindField(fields: readonly TypeField[], bind: ViewBind): TypeField | undefined {
  if (bind === "updated_at") {
    return undefined;
  }
  if (bind === "title" || bind === "status" || bind === "date" || bind === "start" || bind === "end") {
    return fieldByRole(fields, bind);
  }
  if (bind === "subtitle") {
    return fields.find((field) => field.role === "subtitle");
  }
  return undefined;
}

export function bindResolves(fields: readonly TypeField[], bind: ViewBind): boolean {
  if (bind === "title" || bind === "status" || bind === "updated_at") {
    return true;
  }
  return Boolean(bindField(fields, bind));
}

export function resolveBindValue(
  node: QueryNode,
  fields: readonly TypeField[],
  bind: ViewBind,
): string | undefined {
  if (bind === "updated_at") {
    return node.updated_at;
  }
  if (bind === "title") {
    const field = fieldByRole(fields, "title");
    if (field) {
      const value = node.data[field.name];
      return value === undefined || value === null ? undefined : String(value);
    }
    return node.title;
  }
  if (bind === "status") {
    const field = fieldByRole(fields, "status");
    if (field) {
      const value = node.data[field.name];
      return typeof value === "string" ? value : undefined;
    }
    return node.status;
  }
  const field = bindField(fields, bind);
  if (!field) {
    return undefined;
  }
  if (field.kind === "date") {
    return dateValueFromData(node.data, field.name);
  }
  const value = node.data[field.name];
  return value === undefined || value === null ? undefined : String(value);
}

function clauseValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function effectiveClauses(view: ViewDeclaration, showCompleted: boolean): ViewFilterClause[] {
  const clauses = view.filter?.clauses ?? [];
  if (!showCompleted) {
    return clauses;
  }
  return clauses.map((clause) => {
    if (clause.bind !== "status") {
      return clause;
    }
    if (clause.op === "eq" && clause.value === "active") {
      return { bind: "status", op: "in", value: ["active", "completed"] };
    }
    if (clause.op === "in") {
      const values = clauseValues(clause.value);
      if (values.includes("active") && !values.includes("completed")) {
        return { ...clause, value: [...values, "completed"] };
      }
    }
    return clause;
  });
}

function matchesClause(
  node: QueryNode,
  fields: readonly TypeField[],
  clause: ViewFilterClause,
): boolean {
  if (!bindResolves(fields, clause.bind) && clause.bind !== "title" && clause.bind !== "status" && clause.bind !== "updated_at") {
    return false;
  }
  const resolved = resolveBindValue(node, fields, clause.bind);
  if (resolved === undefined) {
    return false;
  }
  const values = clauseValues(clause.value);
  if (clause.op === "eq") {
    return resolved === values[0];
  }
  return values.includes(resolved);
}

export function applyViewQuery<T extends QueryNode>(
  nodes: readonly T[],
  view: ViewDeclaration,
  fields: readonly TypeField[],
  options: { showCompleted?: boolean } = {},
): T[] {
  const clauses = effectiveClauses(view, options.showCompleted === true);
  const filtered = nodes.filter((node) => clauses.every((clause) => matchesClause(node, fields, clause)));
  const sortKeys = (view.sort ?? []).filter((key) => bindResolves(fields, key.bind));
  const keys = sortKeys.length > 0 ? sortKeys : [{ bind: "title" as const, dir: "asc" as const }];
  return [...filtered].sort((left, right) => {
    for (const key of keys) {
      const a = resolveBindValue(left, fields, key.bind) ?? "";
      const b = resolveBindValue(right, fields, key.bind) ?? "";
      if (a === b) {
        continue;
      }
      const cmp = a.localeCompare(b);
      return key.dir === "desc" ? -cmp : cmp;
    }
    return left.title.localeCompare(right.title);
  });
}

export function boardColumnIds(
  fields: readonly TypeField[],
  view: ViewDeclaration,
  options: { showCompleted?: boolean } = {},
): string[] {
  const statusField = fieldByRole(fields, "status");
  const all = statusField?.enum_values ?? ["active", "completed", "archived"];
  const clauses = effectiveClauses(view, options.showCompleted === true).filter((clause) => clause.bind === "status");
  if (clauses.length === 0) {
    return [...all];
  }
  return all.filter((id) =>
    clauses.every((clause) => {
      const values = clauseValues(clause.value);
      return clause.op === "eq" ? id === values[0] : values.includes(id);
    }),
  );
}

export type CollectionChip = { name: string; display: string; value: string };

export function collectionLabel(node: QueryNode, fields: readonly TypeField[]): string {
  return resolveBindValue(node, fields, "title") ?? node.title;
}

export function collectionChips(node: QueryNode, fields: readonly TypeField[]): CollectionChip[] {
  return fields
    .filter((field) => field.role === "subtitle")
    .flatMap((field) => {
      const value = node.data[field.name];
      if (value === undefined || value === null || String(value).trim() === "") {
        return [];
      }
      return [{ name: field.name, display: field.display, value: String(value) }];
    });
}

export function collectionAxisDate(node: QueryNode, fields: readonly TypeField[]): string | undefined {
  const axis = calendarAxisRole(fields);
  if (!axis) {
    return undefined;
  }
  return resolveBindValue(node, fields, axis);
}

const ACTIVE_FILTER: ViewFilter = { clauses: [{ bind: "status", op: "eq", value: "active" }] };
const DATE_THEN_TITLE: ViewSortKey[] = [
  { bind: "date", dir: "asc" },
  { bind: "title", dir: "asc" },
];
const START_THEN_TITLE: ViewSortKey[] = [
  { bind: "start", dir: "asc" },
  { bind: "title", dir: "asc" },
];
const TITLE_SORT: ViewSortKey[] = [{ bind: "title", dir: "asc" }];

function seedViews(
  ids: readonly ViewEngineId[],
  extra: { filter?: ViewFilter; sort?: ViewSortKey[]; groupFor?: Partial<Record<ViewEngineId, ViewBind>> },
): ViewDeclaration[] {
  return ids.map((id) => ({
    id,
    ...(extra.filter ? { filter: extra.filter } : {}),
    ...(extra.sort ? { sort: extra.sort } : { sort: TITLE_SORT }),
    ...(extra.groupFor?.[id] ? { group: { bind: extra.groupFor[id]! } } : {}),
  }));
}

/** Seed types already declare views so first unlocked Home is not a wall of no-views. */
export const SEED_TYPE_VIEWS: Readonly<
  Record<string, { views: readonly ViewDeclaration[]; default_view: ViewEngineId }>
> = {
  task: {
    views: seedViews(["board", "list", "calendar", "timeline", "outline"], {
      filter: ACTIVE_FILTER,
      sort: DATE_THEN_TITLE,
      groupFor: { board: "status", calendar: "date", timeline: "date" },
    }),
    default_view: "board",
  },
  goal: {
    views: seedViews(["list", "calendar", "timeline", "outline"], {
      filter: ACTIVE_FILTER,
      sort: DATE_THEN_TITLE,
      groupFor: { calendar: "date", timeline: "date" },
    }),
    default_view: "list",
  },
  area: { views: seedViews(["list", "outline"], { sort: TITLE_SORT }), default_view: "list" },
  project: { views: seedViews(["list", "outline"], { sort: TITLE_SORT }), default_view: "list" },
  habit: { views: seedViews(["list", "outline"], { sort: TITLE_SORT }), default_view: "list" },
  lesson: { views: seedViews(["list", "outline"], { sort: TITLE_SORT }), default_view: "list" },
  decision: { views: seedViews(["list", "outline"], { sort: TITLE_SORT }), default_view: "list" },
  person: { views: seedViews(["list"], { sort: TITLE_SORT }), default_view: "list" },
  place: { views: seedViews(["list"], { sort: TITLE_SORT }), default_view: "list" },
  company: { views: seedViews(["list"], { sort: TITLE_SORT }), default_view: "list" },
  journal: { views: seedViews(["list"], { sort: TITLE_SORT }), default_view: "list" },
  idea: { views: seedViews(["list"], { sort: TITLE_SORT }), default_view: "list" },
  note: { views: seedViews(["list"], { sort: TITLE_SORT }), default_view: "list" },
  trip: {
    views: seedViews(["list", "calendar", "timeline"], {
      sort: START_THEN_TITLE,
      groupFor: { calendar: "start", timeline: "start" },
    }),
    default_view: "list",
  },
};
