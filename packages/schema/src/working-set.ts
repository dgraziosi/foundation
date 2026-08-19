import { dateValueFromData, fieldByRole, type TypeField } from "./fields.js";
import { DUE_TIMEZONE, isIsoDate } from "./due.js";
import type { NodeType, RelationType } from "./types.js";

export const WORKING_SET_LIMIT_DEFAULT = 40;
export const WORKING_SET_LIMIT_MAX = 40;
export const WORKING_SET_DEPTH_DEFAULT = 1;
export const WORKING_SET_DEPTH_MAX = 2;
export const WORKING_SET_DUE_WITHIN_DAYS_DEFAULT = 14;
export const WORKING_SET_DUE_WITHIN_DAYS_MAX = 90;
export const WORKING_SET_TIMEZONE = DUE_TIMEZONE;

export const WORKING_SET_NODE_NOT_FOUND_SUGGESTION =
  "If you already have a UUID, call get. Search is for lexical recall, not a substitute for get. Deleted nodes are hidden until restored via undo.";

export type WorkingSetWorkMode = "children" | "about" | "event" | "none";

export type WorkingSetWalkPlan = {
  work: WorkingSetWorkMode;
  ancestors: boolean;
  isSpineRoot: boolean;
  hierarchyRelations: string[];
  workRelations: string[];
  incomingOnlyRelations: string[];
};

export type WorkingSetDateFields = {
  due?: string;
  start?: string;
  end?: string;
};

export type WorkingSetSortable = {
  role: "work" | "parent";
  title: string;
  due?: string;
  start?: string;
  via: { hops: number };
};

/** Calendar date plus days, staying on YYYY-MM-DD. */
export function addIsoDays(iso: string, days: number): string {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

export function fieldsOfType(type: NodeType | undefined): TypeField[] {
  return [...(type?.fields ?? [])];
}

export function datesFromNodeData(
  data: Record<string, unknown>,
  type: NodeType | undefined,
): WorkingSetDateFields {
  const fields = fieldsOfType(type);
  const dueField = fieldByRole(fields, "date");
  const startField = fieldByRole(fields, "start");
  const endField = fieldByRole(fields, "end");
  const due = dueField ? dateValueFromData(data, dueField.name) : undefined;
  const start = startField ? dateValueFromData(data, startField.name) : undefined;
  const end = endField ? dateValueFromData(data, endField.name) : undefined;
  return {
    ...(due ? { due } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  };
}

export function sortDateOf(item: { due?: string; start?: string }): string | undefined {
  if (item.due && isIsoDate(item.due)) {
    return item.due;
  }
  if (item.start && isIsoDate(item.start)) {
    return item.start;
  }
  return undefined;
}

export function hasStartAndEndRoles(type: NodeType): boolean {
  const fields = fieldsOfType(type);
  return Boolean(fieldByRole(fields, "start") && fieldByRole(fields, "end"));
}

function hierarchySlugs(relations: readonly RelationType[]): Set<string> {
  const slugs = new Set<string>();
  for (const relation of relations) {
    if (relation.kind === "hierarchy") {
      slugs.add(relation.slug);
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const relation of relations) {
      if (relation.semantic_parent_slug && slugs.has(relation.semantic_parent_slug) && !slugs.has(relation.slug)) {
        slugs.add(relation.slug);
        grew = true;
      }
    }
  }
  return slugs;
}

function slugsWithSemanticParent(
  relations: readonly RelationType[],
  parents: ReadonlySet<string>,
): string[] {
  const slugs = new Set<string>(parents);
  let grew = true;
  while (grew) {
    grew = false;
    for (const relation of relations) {
      if (relation.semantic_parent_slug && slugs.has(relation.semantic_parent_slug) && !slugs.has(relation.slug)) {
        slugs.add(relation.slug);
        grew = true;
      }
    }
  }
  return [...slugs];
}

export function isHierarchyParentType(rootSlug: string, types: readonly NodeType[]): boolean {
  return types.some((type) => type.parent_types.includes(rootSlug));
}

export function isAboutTargetType(rootSlug: string, relations: readonly RelationType[]): boolean {
  return relations.some(
    (relation) =>
      relation.kind === "associative" &&
      relation.target_types.length > 0 &&
      relation.target_types.includes(rootSlug),
  );
}

export function planWorkingSetWalk(
  rootType: NodeType,
  types: readonly NodeType[],
  relations: readonly RelationType[],
): WorkingSetWalkPlan {
  const hierarchyRelations = [...hierarchySlugs(relations)];
  const hierarchyParent = isHierarchyParentType(rootType.slug, types);
  const aboutTarget = isAboutTargetType(rootType.slug, relations);
  const eventLike = hasStartAndEndRoles(rootType) && !hierarchyParent;
  const ancestors = rootType.parent_types.length > 0;
  const isSpineRoot = rootType.kind === "spine" && rootType.parent_types.length === 0;

  if (hierarchyParent) {
    return {
      work: "children",
      ancestors,
      isSpineRoot,
      hierarchyRelations,
      workRelations: hierarchyRelations,
      incomingOnlyRelations: hierarchyRelations,
    };
  }

  if (aboutTarget && rootType.parent_types.length === 0 && !eventLike) {
    const targeted = relations
      .filter(
        (relation) =>
          relation.kind === "associative" &&
          relation.target_types.length > 0 &&
          relation.target_types.includes(rootType.slug),
      )
      .map((relation) => relation.slug);
    const family = slugsWithSemanticParent(relations, new Set(["relates_to", "about", ...targeted]));
    return {
      work: "about",
      ancestors,
      isSpineRoot,
      hierarchyRelations,
      workRelations: family,
      incomingOnlyRelations: targeted,
    };
  }

  if (eventLike) {
    const family = slugsWithSemanticParent(relations, new Set(["relates_to", "supports"]));
    const workRelations = [...new Set([...hierarchyRelations, ...family])];
    return {
      work: "event",
      ancestors,
      isSpineRoot,
      hierarchyRelations,
      workRelations,
      incomingOnlyRelations: hierarchyRelations,
    };
  }

  return {
    work: "none",
    ancestors,
    isSpineRoot,
    hierarchyRelations,
    workRelations: [],
    incomingOnlyRelations: [],
  };
}

export function workItemPassesSpineRootWindow(input: {
  sortDate?: string;
  hops: number;
  today: string;
  dueWithinDays: number;
}): boolean {
  if (!input.sortDate) {
    return input.hops === 1;
  }
  return input.sortDate <= addIsoDays(input.today, input.dueWithinDays);
}

export function compareWorkingSetItems(a: WorkingSetSortable, b: WorkingSetSortable, today: string): number {
  if (a.role !== b.role) {
    return a.role === "parent" ? -1 : 1;
  }
  if (a.role === "parent") {
    if (a.via.hops !== b.via.hops) {
      return a.via.hops - b.via.hops;
    }
    return a.title.localeCompare(b.title);
  }
  const aDate = sortDateOf(a);
  const bDate = sortDateOf(b);
  const aOverdue = Boolean(aDate && aDate < today);
  const bOverdue = Boolean(bDate && bDate < today);
  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }
  if (aDate && bDate && aDate !== bDate) {
    return aDate < bDate ? -1 : 1;
  }
  if (aDate && !bDate) {
    return -1;
  }
  if (!aDate && bDate) {
    return 1;
  }
  return a.title.localeCompare(b.title);
}

export function applyWorkingSetCap<T extends WorkingSetSortable>(
  items: T[],
  limit: number,
): { items: T[]; truncated: boolean } {
  const parents = items.filter((item) => item.role === "parent");
  const work = items.filter((item) => item.role === "work");
  if (parents.length >= limit) {
    return {
      items: parents.slice(0, limit),
      truncated: parents.length > limit || work.length > 0,
    };
  }
  const remaining = limit - parents.length;
  return {
    items: [...parents, ...work.slice(0, remaining)],
    truncated: work.length > remaining,
  };
}
