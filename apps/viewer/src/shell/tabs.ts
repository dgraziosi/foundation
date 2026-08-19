import { isUuid } from "../format";
import type { HostTab } from "./context";

export type PathTab = HostTab | { kind: "home" };

export function tabKey(tab: PathTab): string {
  if (tab.kind === "home") {
    return "home";
  }
  if (tab.kind === "recents") {
    return "recents";
  }
  if (tab.kind === "collection") {
    return `type:${tab.slug}`;
  }
  return `node:${tab.id}`;
}

export function pathTab(pathname: string, params: { slug?: string; id?: string }): PathTab {
  if (pathname === "/recents" || pathname.startsWith("/recents/")) {
    return { kind: "recents", label: "Recents" };
  }
  if (params.slug) {
    return { kind: "collection", slug: params.slug, label: params.slug };
  }
  if (params.id && isUuid(params.id)) {
    return { kind: "detail", id: params.id, label: "Detail" };
  }
  return { kind: "home" };
}

export function hrefFor(tab: PathTab): string {
  if (tab.kind === "home") {
    return "/";
  }
  if (tab.kind === "recents") {
    return "/recents";
  }
  if (tab.kind === "collection") {
    return `/types/${tab.slug}`;
  }
  return `/nodes/${tab.id}`;
}

/**
 * Route identity only. Adds a missing tab; never rewrites a label that is
 * already correct (collection type label, object title). Returns `existing`
 * when membership and the active tab are already right.
 */
export function syncHostTabs(existing: HostTab[], current: PathTab): HostTab[] {
  if (current.kind === "home") {
    return existing;
  }
  const key = tabKey(current);
  if (existing.some((tab) => tabKey(tab) === key)) {
    return existing;
  }
  return [...existing, current];
}

export function upsertCollectionTab(existing: HostTab[], slug: string, label?: string): HostTab[] {
  const nextLabel = label ?? slug;
  const index = existing.findIndex((tab) => tab.kind === "collection" && tab.slug === slug);
  if (index === -1) {
    return [...existing, { kind: "collection", slug, label: nextLabel }];
  }
  const prev = existing[index]!;
  if (prev.kind !== "collection") {
    return existing;
  }
  if (prev.label === nextLabel) {
    return existing;
  }
  if (nextLabel === slug && prev.label !== slug) {
    return existing;
  }
  const next = [...existing];
  next[index] = { ...prev, label: nextLabel };
  return next;
}

export function upsertDetailTab(existing: HostTab[], id: string, label = "Detail"): HostTab[] {
  const index = existing.findIndex((tab) => tab.kind === "detail" && tab.id === id);
  if (index === -1) {
    return [...existing, { kind: "detail", id, label }];
  }
  const prev = existing[index]!;
  if (prev.kind !== "detail") {
    return existing;
  }
  const nextLabel = label === "Detail" ? prev.label : label;
  if (nextLabel === prev.label) {
    return existing;
  }
  const next = [...existing];
  next[index] = { ...prev, label: nextLabel };
  return next;
}

export function upsertRecentsTab(existing: HostTab[]): HostTab[] {
  if (existing.some((tab) => tab.kind === "recents")) {
    return existing;
  }
  return [...existing, { kind: "recents", label: "Recents" }];
}
