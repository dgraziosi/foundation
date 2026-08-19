import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDeclaredViews } from "./resolve.js";

test("viewer does not invent list when views are empty", () => {
  assert.deepEqual(resolveDeclaredViews({ views: [] }), { views: [] });
  assert.deepEqual(resolveDeclaredViews({}), { views: [] });
  assert.deepEqual(resolveDeclaredViews({ views: ["kanban"] }), { views: [] });
});

test("viewer keeps declared order and falls back to the first known id", () => {
  assert.deepEqual(resolveDeclaredViews({ views: ["board", "list"], default_view: "board" }), {
    views: ["board", "list"],
    defaultView: "board",
  });
  assert.deepEqual(resolveDeclaredViews({ views: ["list", "outline"], default_view: "kanban" }), {
    views: ["list", "outline"],
    defaultView: "list",
  });
});
