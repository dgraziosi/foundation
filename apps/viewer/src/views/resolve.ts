import type { ViewDeclaration, ViewEngineId } from "../api";

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

export function viewIdsFrom(
  views?: readonly (string | ViewDeclaration)[] | null,
): ViewEngineId[] {
  return (views ?? [])
    .map((item) => (typeof item === "string" ? item : item.id))
    .filter((id): id is ViewEngineId => KNOWN.has(id));
}

export function asViewDeclarations(
  views?: readonly (string | ViewDeclaration)[] | null,
): ViewDeclaration[] {
  if (!views) {
    return [];
  }
  const out: ViewDeclaration[] = [];
  for (const item of views) {
    if (typeof item === "string") {
      if (KNOWN.has(item)) {
        out.push({ id: item as ViewEngineId });
      }
      continue;
    }
    if (item && KNOWN.has(item.id)) {
      out.push(item);
    }
  }
  return out;
}

export function resolveDeclaredViews(input: {
  views?: readonly (string | ViewDeclaration)[] | null;
  default_view?: string | null;
}): { views: ViewEngineId[]; defaultView?: ViewEngineId; declarations: ViewDeclaration[] } {
  const declarations = asViewDeclarations(input.views);
  const views = declarations.map((item) => item.id);
  if (views.length === 0) {
    return { views: [], declarations: [] };
  }
  const defaultView =
    input.default_view && views.includes(input.default_view as ViewEngineId)
      ? (input.default_view as ViewEngineId)
      : views[0];
  return { views, defaultView, declarations };
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
