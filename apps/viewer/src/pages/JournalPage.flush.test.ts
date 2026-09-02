import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement, useState, type ReactNode } from "react";
import { act, create as createRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { NodeDetail } from "../api";
import { journalEntryDayTitle } from "../format";
import { JournalPage } from "./JournalPage";

const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";

function journalDetail(
  id: string,
  title: string,
  body: string,
  updated: string,
  created = "2026-09-01T12:00:00.000Z",
): NodeDetail {
  return {
    node: {
      id,
      title,
      type: "journal",
      status: "active",
      data: {},
      created_at: created,
      updated_at: updated,
      payload: { media_type: "text/markdown", storage: "inline", body },
    },
    edges: [],
    suggested_links: [],
    due: null,
    due_tone: null,
  };
}

const vault = {
  [idA]: journalDetail(idA, "Morning", "First light.", "2026-09-01T12:00:00.000Z"),
  [idB]: journalDetail(idB, "Evening", "Later.", "2026-09-02T13:00:00.000Z", "2026-09-02T13:00:00.000Z"),
};

type PatchCall = { id: string; title: string; body: string; base_updated_at: string };

function installFetch(input: {
  patches: PatchCall[];
  onPatch?: (call: PatchCall) => Response | Promise<Response>;
}): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    const id = path.split("/").pop() ?? "";
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body ?? "{}")) as {
        title: string;
        body: string;
        base_updated_at: string;
      };
      const call = { id, title: body.title, body: body.body, base_updated_at: body.base_updated_at };
      input.patches.push(call);
      if (input.onPatch) {
        return input.onPatch(call);
      }
      const saved = journalDetail(id, body.title, body.body, "2026-09-01T12:00:02.000Z");
      return new Response(JSON.stringify(saved), { status: 200, headers: { "content-type": "application/json" } });
    }
    const detail = vault[id];
    if (!detail) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return new Response(JSON.stringify(detail), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function SiblingJournals({ start }: { start: string }) {
  return createElement(
    MemoryRouter,
    { initialEntries: [start] },
    createElement(
      Routes,
      null,
      createElement(Route, { path: "/nodes/:id", element: createElement(PageWithSiblingNav) }),
    ),
  );
}

function PageWithSiblingNav() {
  const navigate = useNavigate();
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { type: "button", "data-nav": "sibling", onClick: () => navigate(`/nodes/${idB}`) },
      "Sibling",
    ),
    createElement(
      "button",
      { type: "button", "data-nav": "first", onClick: () => navigate(`/nodes/${idA}`) },
      "First",
    ),
    createElement(JournalPage, { initial: vault[idA] }),
  );
}

function LeaveAndReturn() {
  const [onPage, setOnPage] = useState(true);
  return createElement(
    MemoryRouter,
    { initialEntries: [`/nodes/${idA}`] },
    createElement(
      "div",
      null,
      createElement(
        "button",
        { type: "button", "data-nav": "leave", onClick: () => setOnPage(false) },
        "Leave",
      ),
      createElement(
        "button",
        { type: "button", "data-nav": "back", onClick: () => setOnPage(true) },
        "Back",
      ),
      onPage
        ? createElement(Routes, null, createElement(Route, { path: "/nodes/:id", element: createElement(JournalPage, { initial: vault[idA] }) }))
        : null,
    ),
  );
}

function findByData(root: ReturnType<typeof createRenderer>, attr: string, value: string) {
  return root.root.find((node) => node.props[attr] === value);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "fetch");
  vault[idA] = journalDetail(idA, "Morning", "First light.", "2026-09-01T12:00:00.000Z");
  vault[idB] = journalDetail(idB, "Evening", "Later.", "2026-09-02T13:00:00.000Z", "2026-09-02T13:00:00.000Z");
});

test("a mounted writing page flushes the journal we left, including a cached sibling", async () => {
  const patches: PatchCall[] = [];
  installFetch({ patches });
  if (!globalThis.window) {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  }
  const tree = createElement(Providers, { children: createElement(SiblingJournals, { start: `/nodes/${idA}` }) });
  let root: ReturnType<typeof createRenderer>;
  await act(async () => {
    root = createRenderer(tree);
    await Promise.resolve();
    await Promise.resolve();
  });
  const title = root!.root.findByProps({ "aria-label": "Title" });
  await act(() => {
    title.props.onChange({ target: { value: "Kept on leave" } });
  });
  await act(async () => {
    findByData(root!, "data-nav", "sibling").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.id, idA);
  assert.equal(patches[0]?.title, "Kept on leave");
  assert.notEqual(patches[0]?.id, idB);
});

test("a clash on leave keeps the draft and offers Reload when the person comes back", async () => {
  const patches: PatchCall[] = [];
  installFetch({
    patches,
    onPatch: () =>
      new Response(JSON.stringify({ error: "base_updated_at is stale." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
  });
  if (!globalThis.window) {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const tree = createElement(
    QueryClientProvider,
    { client },
    createElement(LeaveAndReturn),
  );
  let root: ReturnType<typeof createRenderer>;
  await act(async () => {
    root = createRenderer(tree);
    await Promise.resolve();
    await Promise.resolve();
  });
  const title = root!.root.findByProps({ "aria-label": "Title" });
  await act(() => {
    title.props.onChange({ target: { value: "Kept after clash" } });
  });
  await act(async () => {
    findByData(root!, "data-nav", "leave").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(patches.length, 1);
  await act(async () => {
    findByData(root!, "data-nav", "back").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  const backTitle = root!.root.findByProps({ "aria-label": "Title" });
  assert.equal(backTitle.props.value, "Kept after clash");
  assert.ok(root!.root.findByProps({ "data-save": "clash" }));
  assert.ok(root!.root.findAll((node) => node.props.children === "Reload").length > 0);
});

test("a clash leave still keeps the draft when the vault snapshot is newer", async () => {
  const patches: PatchCall[] = [];
  installFetch({
    patches,
    onPatch: () =>
      new Response(JSON.stringify({ error: "base_updated_at is stale." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
  });
  if (!globalThis.window) {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const tree = createElement(QueryClientProvider, { client }, createElement(LeaveAndReturn));
  let root: ReturnType<typeof createRenderer>;
  await act(async () => {
    root = createRenderer(tree);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(() => {
    root!.root.findByProps({ "aria-label": "Title" }).props.onChange({ target: { value: "Kept after clash" } });
  });
  await act(async () => {
    findByData(root!, "data-nav", "leave").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(patches.length, 1);
  const newerVault = journalDetail(idA, "Morning", "Someone else wrote.", "2026-09-01T12:00:09.000Z");
  vault[idA] = newerVault;
  client.setQueryData(["node", idA], newerVault);
  await act(async () => {
    findByData(root!, "data-nav", "back").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(root!.root.findByProps({ "aria-label": "Title" }).props.value, "Kept after clash");
  assert.ok(root!.root.findByProps({ "data-save": "clash" }));
  assert.ok(root!.root.findAll((node) => node.props.children === "Reload").length > 0);
});

test("a later save is not replaced by a stale leave draft", async () => {
  const patches: PatchCall[] = [];
  let failLeave: ((response: Response) => void) | undefined;
  installFetch({
    patches,
    onPatch: (call) => {
      if (call.title === "Old leave") {
        return new Promise((resolve) => {
          failLeave = resolve;
        });
      }
      const saved = journalDetail(call.id, call.title, call.body, "2026-09-01T12:00:03.000Z");
      vault[idA] = saved;
      return new Response(JSON.stringify(saved), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  if (!globalThis.window) {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const tree = createElement(QueryClientProvider, { client }, createElement(LeaveAndReturn));
  let root: ReturnType<typeof createRenderer>;
  await act(async () => {
    root = createRenderer(tree);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(() => {
    root!.root.findByProps({ "aria-label": "Title" }).props.onChange({ target: { value: "Old leave" } });
  });
  await act(async () => {
    findByData(root!, "data-nav", "leave").props.onClick();
    await Promise.resolve();
  });
  await act(async () => {
    findByData(root!, "data-nav", "back").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(() => {
    root!.root.findByProps({ "aria-label": "Title" }).props.onChange({ target: { value: "Newer save" } });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.ok(patches.some((call) => call.title === "Newer save"));
  await act(async () => {
    failLeave?.(
      new Response(JSON.stringify({ error: "base_updated_at is stale." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    findByData(root!, "data-nav", "leave").props.onClick();
    await Promise.resolve();
  });
  await act(async () => {
    findByData(root!, "data-nav", "back").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(root!.root.findByProps({ "aria-label": "Title" }).props.value, "Newer save");
  assert.equal(root!.root.findAll((node) => node.props["data-save"] === "clash").length, 0);
});

test("a sibling leave still flushes the draft typed after a write started", async () => {
  const patches: PatchCall[] = [];
  let releaseFirst: ((response: Response) => void) | undefined;
  installFetch({
    patches,
    onPatch: (call) => {
      if (!releaseFirst) {
        return new Promise((resolve) => {
          releaseFirst = resolve;
        });
      }
      const saved = journalDetail(call.id, call.title, call.body, "2026-09-01T12:00:04.000Z");
      return new Response(JSON.stringify(saved), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  if (!globalThis.window) {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  }
  const tree = createElement(Providers, { children: createElement(SiblingJournals, { start: `/nodes/${idA}` }) });
  let root: ReturnType<typeof createRenderer>;
  await act(async () => {
    root = createRenderer(tree);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(() => {
    root!.root.findByProps({ "aria-label": "Title" }).props.onChange({ target: { value: "First pass" } });
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
  });
  await act(() => {
    root!.root.findByProps({ "aria-label": "Title" }).props.onChange({ target: { value: "Typed after send" } });
  });
  await act(async () => {
    findByData(root!, "data-nav", "sibling").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    releaseFirst?.(
      new Response(JSON.stringify(journalDetail(idA, "First pass", "First light.", "2026-09-01T12:00:02.000Z")), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.ok(patches.some((call) => call.id === idA && call.title === "Typed after send"));
});

test("an empty title on leave keeps that journal's day, not the sibling's", async () => {
  const patches: PatchCall[] = [];
  installFetch({ patches });
  if (!globalThis.window) {
    Object.assign(globalThis, { window: { setTimeout, clearTimeout } });
  }
  const tree = createElement(Providers, { children: createElement(SiblingJournals, { start: `/nodes/${idA}` }) });
  let root: ReturnType<typeof createRenderer>;
  await act(async () => {
    root = createRenderer(tree);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(() => {
    root!.root.findByProps({ "aria-label": "Title" }).props.onChange({ target: { value: "" } });
  });
  await act(async () => {
    findByData(root!, "data-nav", "sibling").props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  const dayA = journalEntryDayTitle("2026-09-01T12:00:00.000Z");
  const dayB = journalEntryDayTitle("2026-09-02T13:00:00.000Z");
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.id, idA);
  assert.equal(patches[0]?.title, dayA);
  assert.notEqual(patches[0]?.title, dayB);
});
