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
