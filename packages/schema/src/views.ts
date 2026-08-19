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

export const VIEWS_SUGGESTION =
  "views is an ordered array of list, card, table, board, calendar, timeline, outline, graph. default_view must be one of those ids. Omit default_view when views is empty.";

export type ResolvedTypeViews = {
  views: ViewEngineId[];
  defaultView?: ViewEngineId;
};

/** Drop unknown ids. If default_view is missing or not remaining, use the first remaining id. */
export function resolveTypeViews(input: {
  views?: readonly string[] | null;
  default_view?: string | null;
}): ResolvedTypeViews {
  const views = (input.views ?? []).filter(isViewEngineId);
  if (views.length === 0) {
    return { views: [] };
  }
  const declared = input.default_view;
  const defaultView =
    declared && views.includes(declared as ViewEngineId) ? (declared as ViewEngineId) : views[0];
  return { views, defaultView };
}

export type ParsedTypeViews =
  | { ok: true; views: ViewEngineId[]; default_view?: ViewEngineId }
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
  if (!Array.isArray(input.views) || input.views.some((item) => typeof item !== "string")) {
    return { ok: false, error: "views must be an array of view ids", suggestion: VIEWS_SUGGESTION };
  }
  const unknown = input.views.filter((item) => !isViewEngineId(item));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown view id: ${unknown.join(", ")}`,
      suggestion: VIEWS_SUGGESTION,
    };
  }
  const views = input.views as ViewEngineId[];
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
  if (!views.includes(input.default_view as ViewEngineId)) {
    return {
      ok: false,
      error: "default_view must be a member of views",
      suggestion: VIEWS_SUGGESTION,
    };
  }
  return { ok: true, views, default_view: input.default_view as ViewEngineId };
}

/** Seed types already declare views so first unlocked Home is not a wall of no-views. */
export const SEED_TYPE_VIEWS: Readonly<
  Record<string, { views: readonly ViewEngineId[]; default_view: ViewEngineId }>
> = {
  task: { views: ["board", "list", "calendar", "timeline", "outline"], default_view: "board" },
  goal: { views: ["list", "calendar", "timeline", "outline"], default_view: "list" },
  area: { views: ["list", "outline"], default_view: "list" },
  project: { views: ["list", "outline"], default_view: "list" },
  habit: { views: ["list", "outline"], default_view: "list" },
  lesson: { views: ["list", "outline"], default_view: "list" },
  decision: { views: ["list", "outline"], default_view: "list" },
  person: { views: ["list"], default_view: "list" },
  place: { views: ["list"], default_view: "list" },
  company: { views: ["list"], default_view: "list" },
  journal: { views: ["list"], default_view: "list" },
  idea: { views: ["list"], default_view: "list" },
  note: { views: ["list"], default_view: "list" },
  trip: { views: ["list"], default_view: "list" },
};
