import type { TypeField, TypeViewNode, ViewBind, ViewDeclaration } from "../api";

export const SHOW_COMPLETED_KEY = "foundation.show_completed";

export function readShowCompleted(): boolean {
  try {
    return sessionStorage.getItem(SHOW_COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowCompleted(on: boolean): void {
  try {
    if (on) {
      sessionStorage.setItem(SHOW_COMPLETED_KEY, "1");
    } else {
      sessionStorage.removeItem(SHOW_COMPLETED_KEY);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function fieldByRole(fields: readonly TypeField[], role: TypeField["role"]): TypeField | undefined {
  return fields.find((field) => field.role === role);
}

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

function bindResolves(fields: readonly TypeField[], bind: ViewBind): boolean {
  if (bind === "title" || bind === "status" || bind === "updated_at") {
    return true;
  }
  return Boolean(bindField(fields, bind));
}

function resolveBindValue(node: TypeViewNode, fields: readonly TypeField[], bind: ViewBind): string | undefined {
  if (bind === "updated_at") {
    return node.updated_at;
  }
  if (bind === "title") {
    const field = fieldByRole(fields, "title");
    if (field) {
      const value = node.data?.[field.name];
      return value === undefined || value === null ? undefined : String(value);
    }
    return node.title;
  }
  if (bind === "status") {
    const field = fieldByRole(fields, "status");
    if (field) {
      const value = node.data?.[field.name];
      return typeof value === "string" ? value : undefined;
    }
    return node.status;
  }
  const field = bindField(fields, bind);
  if (!field) {
    return undefined;
  }
  const value = node.data?.[field.name];
  return value === undefined || value === null ? undefined : String(value);
}

function clauseValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function effectiveClauses(view: ViewDeclaration, showCompleted: boolean) {
  const clauses = view.filter?.clauses ?? [];
  if (!showCompleted) {
    return clauses;
  }
  return clauses.map((clause) => {
    if (clause.bind !== "status") {
      return clause;
    }
    if (clause.op === "eq" && clause.value === "active") {
      return { bind: "status" as const, op: "in" as const, value: ["active", "completed"] };
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
  node: TypeViewNode,
  fields: readonly TypeField[],
  clause: { bind: ViewBind; op: "eq" | "in"; value: string | string[] },
): boolean {
  if (!bindResolves(fields, clause.bind) && clause.bind !== "title" && clause.bind !== "status" && clause.bind !== "updated_at") {
    return false;
  }
  const resolved = resolveBindValue(node, fields, clause.bind);
  if (resolved === undefined) {
    return false;
  }
  const values = clauseValues(clause.value);
  return clause.op === "eq" ? resolved === values[0] : values.includes(resolved);
}

export function applyViewQuery(
  nodes: readonly TypeViewNode[],
  view: ViewDeclaration,
  fields: readonly TypeField[],
  options: { showCompleted?: boolean } = {},
): TypeViewNode[] {
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

export function collectionChips(
  node: { data?: Record<string, unknown> },
  fields: readonly TypeField[],
): Array<{ name: string; display: string; value: string }> {
  return fields
    .filter((field) => field.role === "subtitle")
    .flatMap((field) => {
      const value = node.data?.[field.name];
      if (value === undefined || value === null || String(value).trim() === "") {
        return [];
      }
      return [{ name: field.name, display: field.display, value: String(value) }];
    });
}
