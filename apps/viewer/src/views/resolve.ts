import type { ViewEngineId } from "../api";

export const VIEW_ENGINE_IDS: ViewEngineId[] = [
  "list",
  "card",
  "table",
  "board",
  "calendar",
  "timeline",
  "outline",
  "graph",
];

const KNOWN = new Set<string>(VIEW_ENGINE_IDS);

export function resolveDeclaredViews(input: {
  views?: readonly string[] | null;
  default_view?: string | null;
}): { views: ViewEngineId[]; defaultView?: ViewEngineId } {
  const views = (input.views ?? []).filter((id): id is ViewEngineId => KNOWN.has(id));
  if (views.length === 0) {
    return { views: [] };
  }
  const defaultView =
    input.default_view && views.includes(input.default_view as ViewEngineId)
      ? (input.default_view as ViewEngineId)
      : views[0];
  return { views, defaultView };
}

/** Picked engine is only kept while it belongs to this slug. */
export function resolveActiveView(
  slug: string,
  declared: { views: ViewEngineId[]; defaultView?: ViewEngineId },
  picked?: { slug: string; view?: ViewEngineId },
): ViewEngineId | undefined {
  if (declared.views.length === 0) {
    return undefined;
  }
  if (picked && picked.slug === slug && picked.view && declared.views.includes(picked.view)) {
    return picked.view;
  }
  return declared.defaultView;
}

export const VIEW_LABELS: Record<ViewEngineId, string> = {
  list: "List",
  card: "Card",
  table: "Table",
  board: "Board",
  calendar: "Calendar",
  timeline: "Timeline",
  outline: "Outline",
  graph: "Graph",
};
