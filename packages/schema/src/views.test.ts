import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyViewQuery,
  boardColumnIds,
  calendarAxisRole,
  collectionChips,
  mergeTypeViewsPatch,
  parseTypeViewsInput,
  resolveTypeViews,
  SEED_TYPE_VIEWS,
  VIEW_ENGINE_IDS,
  viewIds,
} from "./views.js";
import type { TypeField } from "./fields.js";

test("resolveTypeViews drops unknown ids and does not invent list", () => {
  assert.deepEqual(resolveTypeViews({ views: [] }), { views: [], declarations: [] });
  assert.deepEqual(resolveTypeViews({}), { views: [], declarations: [] });
  assert.deepEqual(resolveTypeViews({ views: ["kanban", "unknown"] }), { views: [], declarations: [] });
  assert.deepEqual(resolveTypeViews({ views: ["board", "kanban", "list"], default_view: "kanban" }), {
    views: ["board", "list"],
    defaultView: "board",
    declarations: [{ id: "board" }, { id: "list" }],
  });
  assert.deepEqual(resolveTypeViews({ views: ["list", "outline"], default_view: "list" }), {
    views: ["list", "outline"],
    defaultView: "list",
    declarations: [{ id: "list" }, { id: "outline" }],
  });
});

test("mergeTypeViewsPatch resolves default against views being written", () => {
  assert.deepEqual(
    mergeTypeViewsPatch({ views: ["board", "list"], default_view: "board" }, { views: ["list", "outline"] }),
    { ok: true, views: [{ id: "list" }, { id: "outline" }], default_view: "list" },
  );
  assert.deepEqual(
    mergeTypeViewsPatch({ views: ["board", "list"], default_view: "board" }, { views: [] }),
    { ok: true, views: [] },
  );
  assert.deepEqual(
    mergeTypeViewsPatch({ views: ["board", "list"], default_view: "board" }, { views: [], default_view: null }),
    { ok: true, views: [] },
  );
  assert.equal(
    mergeTypeViewsPatch(
      { views: ["board", "list"], default_view: "board" },
      { views: ["list"], default_view: "board" },
    ).ok,
    false,
  );
  const kept = mergeTypeViewsPatch({ views: ["board", "list"], default_view: "board" }, {});
  assert.equal(kept.ok, true);
  if (kept.ok) {
    assert.deepEqual(viewIds(kept.views), ["board", "list"]);
    assert.equal(kept.default_view, "board");
  }
});

test("parseTypeViewsInput accepts ids or declarations", () => {
  assert.deepEqual(parseTypeViewsInput({}), { ok: true, views: [] });
  assert.equal(parseTypeViewsInput({ views: ["list", "kanban"] }).ok, false);
  assert.equal(parseTypeViewsInput({ default_view: "list" }).ok, false);
  assert.equal(parseTypeViewsInput({ views: ["board"], default_view: "list" }).ok, false);
  assert.deepEqual(parseTypeViewsInput({ views: ["board", "list"], default_view: "board" }), {
    ok: true,
    views: [{ id: "board" }, { id: "list" }],
    default_view: "board",
  });
  const declared = parseTypeViewsInput({
    views: [
      {
        id: "board",
        filter: { clauses: [{ bind: "status", op: "eq", value: "active" }] },
        sort: [{ bind: "date", dir: "asc" }],
        group: { bind: "status" },
      },
    ],
    default_view: "board",
  });
  assert.equal(declared.ok, true);
});

test("seed type views match first-paint queries", () => {
  assert.deepEqual(VIEW_ENGINE_IDS, [
    "list",
    "card",
    "table",
    "board",
    "calendar",
    "timeline",
    "outline",
    "graph",
  ]);
  assert.deepEqual(viewIds(SEED_TYPE_VIEWS.task.views), [
    "board",
    "list",
    "calendar",
    "timeline",
    "outline",
  ]);
  assert.equal(SEED_TYPE_VIEWS.task.default_view, "board");
  assert.equal(SEED_TYPE_VIEWS.note?.default_view, "list");
  assert.deepEqual(viewIds(SEED_TYPE_VIEWS.goal?.views), ["list", "calendar", "timeline", "outline"]);
  assert.deepEqual(viewIds(SEED_TYPE_VIEWS.trip?.views), ["list", "calendar", "timeline"]);
  const board = SEED_TYPE_VIEWS.task.views.find((view) => view.id === "board");
  assert.deepEqual(board?.filter, { clauses: [{ bind: "status", op: "eq", value: "active" }] });
  assert.deepEqual(board?.group, { bind: "status" });
  for (const [slug, declared] of Object.entries(SEED_TYPE_VIEWS)) {
    assert.ok(viewIds(declared.views).includes(declared.default_view), slug);
  }
});

const dueField: TypeField = {
  name: "due",
  display: "Due",
  kind: "date",
  needed: false,
  role: "date",
};

test("applyViewQuery filters active, sort skips missing date role, showCompleted widens", () => {
  const nodes = [
    { id: "1", title: "B", status: "active", data: { due: "2026-08-28" } },
    { id: "2", title: "A", status: "completed", data: { due: "2026-08-20" } },
    { id: "3", title: "C", status: "archived", data: { due: "2026-08-10" } },
  ];
  const view = SEED_TYPE_VIEWS.task.views.find((item) => item.id === "list")!;
  const active = applyViewQuery(nodes, view, [dueField]);
  assert.deepEqual(
    active.map((node) => node.id),
    ["1"],
  );
  const shown = applyViewQuery(nodes, view, [dueField], { showCompleted: true });
  assert.deepEqual(
    shown.map((node) => node.id),
    ["2", "1"],
  );
  const noDate = applyViewQuery(nodes, { id: "list", sort: [{ bind: "date", dir: "asc" }] }, []);
  assert.deepEqual(
    noDate.map((node) => node.title),
    ["A", "B", "C"],
  );
  assert.equal(calendarAxisRole([]), null);
  assert.equal(calendarAxisRole([dueField]), "date");
  assert.deepEqual(boardColumnIds([dueField], view), ["active"]);
  assert.deepEqual(boardColumnIds([dueField], view, { showCompleted: true }), ["active", "completed"]);
});

test("collection chips are subtitle fields only", () => {
  const chips = collectionChips(
    { id: "1", title: "Ada", status: "active", data: { org: "Labs", secret: "nope" } },
    [{ name: "org", display: "Org", kind: "string", needed: false, role: "subtitle" }],
  );
  assert.deepEqual(chips, [{ name: "org", display: "Org", value: "Labs" }]);
});
