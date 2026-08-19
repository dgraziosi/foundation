import assert from "node:assert/strict";
import { test } from "node:test";
import type { TypeField, TypeViewNode, ViewDeclaration } from "../api";
import { applyViewQuery, boardColumnIds, calendarAxisRole, collectionChips } from "./query.js";

const dueField: TypeField = { name: "due", display: "Due", kind: "date", needed: false, role: "date" };
const orgField: TypeField = { name: "org", display: "Org", kind: "string", needed: false, role: "subtitle" };

const activeList: ViewDeclaration = {
  id: "list",
  filter: { clauses: [{ bind: "status", op: "eq", value: "active" }] },
};

const nodes: TypeViewNode[] = [
  { id: "1", title: "Open", type: "task", status: "active", data: { due: "2026-08-28" } },
  { id: "2", title: "Done", type: "task", status: "completed", data: { due: "2026-08-20" } },
  { id: "3", title: "Old", type: "task", status: "archived", data: { due: "2026-08-10" } },
];

test("show completed widens active filter and still hides archived", () => {
  assert.deepEqual(
    applyViewQuery(nodes, activeList, [dueField]).map((node) => node.id),
    ["1"],
  );
  assert.deepEqual(
    applyViewQuery(nodes, activeList, [dueField], { showCompleted: true }).map((node) => node.id),
    ["2", "1"],
  );
  assert.deepEqual(boardColumnIds([dueField], activeList), ["active"]);
  assert.deepEqual(boardColumnIds([dueField], activeList, { showCompleted: true }), ["active", "completed"]);
});

test("person collection chips are subtitle fields, not the whole bag", () => {
  const chips = collectionChips(
    { data: { org: "Labs", secret: "nope", mood: "x" } },
    [orgField],
  );
  assert.deepEqual(chips, [{ name: "org", display: "Org", value: "Labs" }]);
});

test("calendar without a date role is an honest empty", () => {
  assert.equal(calendarAxisRole([]), null);
  assert.equal(calendarAxisRole([orgField]), null);
  assert.equal(calendarAxisRole([dueField]), "date");
});
