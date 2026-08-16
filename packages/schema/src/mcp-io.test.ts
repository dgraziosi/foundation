import assert from "node:assert/strict";
import { test } from "node:test";
import { ManageTypeInputSchema, SearchInputSchema, searchHasSelector } from "./mcp-io.js";

test("search query is optional when a filter is set", () => {
  const listed = SearchInputSchema.parse({ type: "task", status: "active" });
  assert.equal(listed.query, undefined);
  assert.equal(listed.type, "task");
  assert.equal(listed.status, "active");
  const origin = SearchInputSchema.parse({ origin: { system: "gmail", id: "msg-1" } });
  assert.equal(origin.origin?.system, "gmail");
  SearchInputSchema.parse({ under: "11111111-1111-4111-8111-111111111111" });
  SearchInputSchema.parse({ since: "2026-08-13T00:00:00Z" });
  SearchInputSchema.parse({ due: "overdue" });
  SearchInputSchema.parse({ due: "today" });
  SearchInputSchema.parse({ due_on_or_before: "2026-08-27" });
  SearchInputSchema.parse({ due_on_or_after: "2026-08-01", due_on_or_before: "2026-08-27" });
  SearchInputSchema.parse({ data_equals: { kind: "fixture_alpha" } });
  SearchInputSchema.parse({ data_equals: { kind: "fixture_alpha", status: "potential" } });
  assert.throws(() => SearchInputSchema.parse({ due_on_or_before: "2026-08-27T00:00:00Z" }));
  assert.throws(() => SearchInputSchema.parse({ due: "soon" }));
  assert.throws(() => SearchInputSchema.parse({ data_equals: { "Kind": "x" } }));
  assert.equal(searchHasSelector({ data_equals: { kind: "fixture_alpha" } }), true);
  assert.equal(searchHasSelector({ data_equals: {} }), false);
  assert.equal(searchHasSelector({}), false);
});

test("search still accepts a lexical query", () => {
  const parsed = SearchInputSchema.parse({ query: "Ada", type: "person" });
  assert.equal(parsed.query, "Ada");
});

test("manage_type accepts retire with confirm and purge_deleted", () => {
  const retired = ManageTypeInputSchema.parse({
    action: "retire",
    slug: "meeting",
    confirm: true,
    purge_deleted: true,
  });
  assert.equal(retired.action, "retire");
  assert.equal(retired.confirm, true);
  assert.equal(retired.purge_deleted, true);
  assert.throws(() => ManageTypeInputSchema.parse({ action: "delete", slug: "meeting" }));
});
