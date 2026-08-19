import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeTypeViewsPatch,
  parseTypeViewsInput,
  resolveTypeViews,
  SEED_TYPE_VIEWS,
  VIEW_ENGINE_IDS,
} from "./views.js";

test("resolveTypeViews drops unknown ids and does not invent list", () => {
  assert.deepEqual(resolveTypeViews({ views: [] }), { views: [] });
  assert.deepEqual(resolveTypeViews({}), { views: [] });
  assert.deepEqual(resolveTypeViews({ views: ["kanban", "unknown"] }), { views: [] });
  assert.deepEqual(resolveTypeViews({ views: ["board", "kanban", "list"], default_view: "kanban" }), {
    views: ["board", "list"],
    defaultView: "board",
  });
  assert.deepEqual(resolveTypeViews({ views: ["list", "outline"], default_view: "list" }), {
    views: ["list", "outline"],
    defaultView: "list",
  });
});

test("mergeTypeViewsPatch resolves default against views being written", () => {
  assert.deepEqual(
    mergeTypeViewsPatch({ views: ["board", "list"], default_view: "board" }, { views: ["list", "outline"] }),
    { ok: true, views: ["list", "outline"], default_view: "list" },
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
  assert.deepEqual(
    mergeTypeViewsPatch({ views: ["board", "list"], default_view: "board" }, {}),
    { ok: true, views: ["board", "list"], default_view: "board" },
  );
});

test("parseTypeViewsInput refuses unknown ids and a default outside views", () => {
  assert.deepEqual(parseTypeViewsInput({}), { ok: true, views: [] });
  assert.equal(parseTypeViewsInput({ views: ["list", "kanban"] }).ok, false);
  assert.equal(parseTypeViewsInput({ default_view: "list" }).ok, false);
  assert.equal(parseTypeViewsInput({ views: ["board"], default_view: "list" }).ok, false);
  assert.deepEqual(parseTypeViewsInput({ views: ["board", "list"], default_view: "board" }), {
    ok: true,
    views: ["board", "list"],
    default_view: "board",
  });
});

test("seed type views match the Viewer contract table", () => {
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
  assert.deepEqual(SEED_TYPE_VIEWS.task, {
    views: ["board", "list", "calendar", "timeline", "outline"],
    default_view: "board",
  });
  assert.equal(SEED_TYPE_VIEWS.note?.default_view, "list");
  assert.deepEqual(SEED_TYPE_VIEWS.goal?.views, ["list", "calendar", "timeline", "outline"]);
  for (const [slug, declared] of Object.entries(SEED_TYPE_VIEWS)) {
    assert.ok(declared.views.includes(declared.default_view), slug);
  }
});
