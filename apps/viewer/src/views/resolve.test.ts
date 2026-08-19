import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveActiveView, resolveDeclaredViews } from "./resolve.js";

test("viewer does not invent list when views are empty", () => {
  assert.deepEqual(resolveDeclaredViews({ views: [] }), { views: [], declarations: [] });
  assert.deepEqual(resolveDeclaredViews({}), { views: [], declarations: [] });
  assert.deepEqual(resolveDeclaredViews({ views: ["kanban"] }), { views: [], declarations: [] });
});

test("active engine resets to default_view when the type slug changes", () => {
  const task = { views: ["board", "list", "outline"] as const, defaultView: "board" as const };
  const project = { views: ["list", "outline"] as const, defaultView: "list" as const };
  const blank = { views: [] as const };
  assert.equal(resolveActiveView("task", task, { slug: "task", view: "outline" }), "outline");
  assert.equal(resolveActiveView("project", project, { slug: "task", view: "outline" }), "list");
  assert.equal(resolveActiveView("blank_view", blank, { slug: "task", view: "outline" }), undefined);
  assert.equal(resolveActiveView("project", project), "list");
});

test("viewer keeps declared order and falls back to the first known id", () => {
  assert.deepEqual(resolveDeclaredViews({ views: ["board", "list"], default_view: "board" }), {
    views: ["board", "list"],
    defaultView: "board",
    declarations: [{ id: "board" }, { id: "list" }],
  });
  assert.deepEqual(resolveDeclaredViews({ views: ["list", "outline"], default_view: "kanban" }), {
    views: ["list", "outline"],
    defaultView: "list",
    declarations: [{ id: "list" }, { id: "outline" }],
  });
  assert.deepEqual(
    resolveDeclaredViews({
      views: [{ id: "board", filter: { clauses: [{ bind: "status", op: "eq", value: "active" }] } }],
      default_view: "board",
    }),
    {
      views: ["board"],
      defaultView: "board",
      declarations: [{ id: "board", filter: { clauses: [{ bind: "status", op: "eq", value: "active" }] } }],
    },
  );
});
