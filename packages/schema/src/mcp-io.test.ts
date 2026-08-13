import assert from "node:assert/strict";
import { test } from "node:test";
import { SearchInputSchema } from "./mcp-io.js";

test("search query is optional when a filter is set", () => {
  const listed = SearchInputSchema.parse({ type: "task", status: "active" });
  assert.equal(listed.query, undefined);
  assert.equal(listed.type, "task");
  assert.equal(listed.status, "active");
  const origin = SearchInputSchema.parse({ origin: { system: "gmail", id: "msg-1" } });
  assert.equal(origin.origin?.system, "gmail");
  SearchInputSchema.parse({ under: "11111111-1111-4111-8111-111111111111" });
  SearchInputSchema.parse({ since: "2026-08-13T00:00:00Z" });
});

test("search still accepts a lexical query", () => {
  const parsed = SearchInputSchema.parse({ query: "Liz", type: "person" });
  assert.equal(parsed.query, "Liz");
});
