import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GetSuccessSchema,
  LINK_BATCH_MAX,
  LinkInputSchema,
  LinkSuccessSchema,
  LookupInputSchema,
  LookupSuccessSchema,
  WorkingSetInputSchema,
  WorkingSetSuccessSchema,
  ManageTypeInputSchema,
  SEARCH_URL_STRING_SUGGESTION,
  SearchInputSchema,
  SearchUrlFilterSchema,
  SuggestedLinkSchema,
  UpsertInputSchema,
  UpsertSuccessSchema,
  isToolError,
  normalizeLinkEdges,
  searchHasSelector,
} from "./mcp-io.js";

test("search query is optional when a filter is set", () => {
  const listed = SearchInputSchema.parse({ type: "task", status: "active" });
  assert.equal(listed.query, undefined);
  assert.equal(listed.type, "task");
  assert.equal(listed.status, "active");
  const url = SearchInputSchema.parse({ url: { system: "gmail", id: "msg-1" } });
  assert.equal(url.url?.system, "gmail");
  assert.equal(searchHasSelector({ url: { system: "gmail", id: "msg-1" } }), true);
  const repo = SearchInputSchema.parse({ repo: { system: "github", id: "repo-fixture-1" } });
  assert.equal(repo.repo?.system, "github");
  assert.equal(searchHasSelector({ repo: { system: "github", id: "repo-fixture-1" } }), true);
  assert.throws(() => SearchInputSchema.parse({ url: { system: "github", id: "repo-fixture-1" } }));
  assert.throws(() => SearchInputSchema.parse({ repo: { system: "drive", id: "file-fixture-1" } }));
  const receipt = SearchInputSchema.parse({
    receipt: { system: "gmail", id: "msg-fixture-sent-1" },
  });
  assert.equal(receipt.receipt?.system, "gmail");
  assert.equal(receipt.receipt?.id, "msg-fixture-sent-1");
  assert.equal(searchHasSelector({ receipt: { system: "gmail", id: "msg-fixture-sent-1" } }), true);
  assert.throws(() => SearchInputSchema.parse({ receipt: { system: "github", id: "x" } }));
  SearchInputSchema.parse({ under: "11111111-1111-4111-8111-111111111111" });
  SearchInputSchema.parse({ since: "2026-08-13T00:00:00Z" });
  SearchInputSchema.parse({ due: "overdue" });
  SearchInputSchema.parse({ due: "today" });
  SearchInputSchema.parse({ due_on_or_before: "2026-08-27" });
  SearchInputSchema.parse({ due_on_or_after: "2026-08-01", due_on_or_before: "2026-08-27" });
  SearchInputSchema.parse({ data_equals: { kind: "fixture_alpha" } });
  SearchInputSchema.parse({ data_equals: { kind: "fixture_alpha", status: "potential" } });
  SearchInputSchema.parse({
    data_equals: { url: "https://example.test/drive/file-fixture-1" },
  });
  assert.throws(() =>
    SearchInputSchema.parse({ url: "https://example.test/drive/file-fixture-1" }),
  );
  const refusedUrl = SearchInputSchema.safeParse({
    url: "https://example.test/drive/file-fixture-1",
  });
  assert.equal(refusedUrl.success, false);
  if (!refusedUrl.success) {
    assert.equal(refusedUrl.error.issues[0]?.message, SEARCH_URL_STRING_SUGGESTION);
    assert.deepEqual(refusedUrl.error.issues[0]?.path, ["url"]);
  }
  assert.throws(() =>
    SearchInputSchema.parse({ query: "Ada", url: "https://example.test/drive/file-fixture-1" }),
  );
  const refusedUrlWithQuery = SearchInputSchema.safeParse({
    query: "Ada",
    url: "https://example.test/drive/file-fixture-1",
  });
  assert.equal(refusedUrlWithQuery.success, false);
  if (!refusedUrlWithQuery.success) {
    assert.equal(refusedUrlWithQuery.error.issues[0]?.message, SEARCH_URL_STRING_SUGGESTION);
  }
  const objectUrl = SearchUrlFilterSchema.parse({ system: "gmail", id: "msg-1" });
  assert.equal(objectUrl?.system, "gmail");
  assert.equal(SearchUrlFilterSchema.parse(undefined), undefined);
  assert.ok("url" in SearchInputSchema.shape);
  assert.ok("repo" in SearchInputSchema.shape);
  assert.equal("link" in SearchInputSchema.shape, false);
  assert.equal("living" in SearchInputSchema.shape, false);
  assert.equal("code" in SearchInputSchema.shape, false);
  assert.equal("origin" in SearchInputSchema.shape, false);
  const leftoverLink = SearchInputSchema.parse({
    link: { system: "gmail", id: "msg-fixture-1" },
  });
  assert.equal("link" in leftoverLink, false);
  assert.equal(searchHasSelector(leftoverLink), false);
  const leftoverOrigin = SearchInputSchema.parse({
    origin: { system: "gmail", id: "msg-fixture-1" },
  });
  assert.equal("origin" in leftoverOrigin, false);
  assert.equal(searchHasSelector(leftoverOrigin), false);
  const leftoverLiving = SearchInputSchema.parse({
    living: { system: "gmail", id: "msg-fixture-1" },
  });
  assert.equal("living" in leftoverLiving, false);
  assert.equal(searchHasSelector(leftoverLiving), false);
  const leftoverCode = SearchInputSchema.parse({
    code: { system: "github", id: "repo-fixture-1" },
  });
  assert.equal("code" in leftoverCode, false);
  assert.equal(searchHasSelector(leftoverCode), false);
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

test("working_set input defaults are optional and cap at 40 / depth 2", () => {
  const parsed = WorkingSetInputSchema.parse({ id: "11111111-1111-4111-8111-111111111111" });
  assert.equal(parsed.include_completed, undefined);
  assert.equal(parsed.depth, undefined);
  WorkingSetInputSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    include_completed: true,
    depth: 2,
    limit: 40,
    due_within_days: 14,
  });
  assert.throws(() =>
    WorkingSetInputSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      depth: 3,
    }),
  );
  assert.throws(() =>
    WorkingSetInputSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      limit: 41,
    }),
  );
  WorkingSetSuccessSchema.parse({
    root: {
      id: "11111111-1111-4111-8111-111111111111",
      type: "goal",
      title: "Ship",
      status: "active",
    },
    items: [],
    walk: {
      work: "children",
      ancestors: true,
      relations: ["child_of"],
      depth: 1,
      due_window: null,
    },
    truncated: false,
  });
});

test("lookup accepts a batch of names and rejects an empty list", () => {
  const parsed = LookupInputSchema.parse({
    type: "person",
    inputs: [
      { id: "a", name: "Priya Shah" },
      { id: "b", name: "Jorden Hale" },
    ],
  });
  assert.equal(parsed.inputs.length, 2);
  assert.throws(() => LookupInputSchema.parse({ inputs: [] }));
  LookupSuccessSchema.parse({
    results: [
      {
        input: { name: "Priya Shah", type: "person", id: "a" },
        outcome: "exact",
        candidates: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            type: "person",
            title: "Priya Shah",
            status: "active",
            updated_at: "2026-08-17T00:00:00.000Z",
            confidence: 1,
            match: "title_exact",
            matched_value: "Priya Shah",
            explanation: "Title match after case, accent, punctuation, and whitespace folding.",
          },
        ],
      },
    ],
  });
});

test("suggested_links are seed relations to a live target", () => {
  const link = SuggestedLinkSchema.parse({
    kind: "child_of",
    target: {
      id: "11111111-1111-4111-8111-111111111111",
      type: "project",
      title: "Kitchen remodel",
    },
    reason: "Title matches an allowed parent.",
  });
  assert.equal(link.kind, "child_of");
  assert.throws(() =>
    SuggestedLinkSchema.parse({
      kind: "supports",
      target: link.target,
      reason: "invented",
    }),
  );
  const empty = UpsertSuccessSchema.parse({
    node: {
      id: "11111111-1111-4111-8111-111111111111",
      type: "note",
      title: "scratch",
      status: "active",
      payload: { media_type: "text/plain", storage: "inline", body: "" },
      data: {},
      metadata: {},
      created_at: "2026-08-16T00:00:00.000Z",
      updated_at: "2026-08-16T00:00:00.000Z",
      deleted_at: null,
    },
    activity_id: "22222222-2222-4222-8222-222222222222",
    suggested_links: [],
  });
  assert.deepEqual(empty.suggested_links, []);
  GetSuccessSchema.parse({
    node: empty.node,
    edges: [],
    suggested_links: [],
  });
});

test("link accepts a flat one-edge call or a capped edges batch", () => {
  const ids = {
    a: "11111111-1111-4111-8111-111111111111",
    b: "22222222-2222-4222-8222-222222222222",
  };
  const flat = LinkInputSchema.parse({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "relates_to",
    from_base_updated_at: "2026-08-19T00:00:00.000Z",
    to_base_updated_at: "2026-08-19T00:00:00.000Z",
  });
  assert.equal(flat.from_id, ids.a);
  assert.equal(flat.edges, undefined);

  const batch = LinkInputSchema.parse({
    edges: [
      {
        from_id: ids.a,
        to_id: ids.b,
        relation_type: "relates_to",
        from_base_updated_at: "2026-08-19T00:00:00.000Z",
        to_base_updated_at: "2026-08-19T00:00:00.000Z",
      },
    ],
  });
  assert.equal(batch.edges?.length, 1);
  assert.throws(() => LinkInputSchema.parse({ edges: [] }));
  assert.throws(() =>
    LinkInputSchema.parse({
      edges: Array.from({ length: LINK_BATCH_MAX + 1 }, () => ({
        from_id: ids.a,
        to_id: ids.b,
        relation_type: "relates_to",
      })),
    }),
  );

  const mixed = normalizeLinkEdges({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "relates_to",
    edges: [
      { from_id: ids.a, to_id: ids.b, relation_type: "relates_to" },
    ],
  });
  assert.equal(isToolError(mixed), true);
  if (!isToolError(mixed)) return;
  assert.match(mixed.error, /not both/);

  const incomplete = normalizeLinkEdges({ from_id: ids.a });
  assert.equal(isToolError(incomplete), true);

  const normalizedFlat = normalizeLinkEdges({
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "relates_to",
  });
  assert.equal(isToolError(normalizedFlat), false);
  if (isToolError(normalizedFlat)) return;
  assert.equal(normalizedFlat.form, "flat");
  assert.equal(normalizedFlat.edges.length, 1);

  const edge = {
    id: "33333333-3333-4333-8333-333333333333",
    from_id: ids.a,
    to_id: ids.b,
    relation_type: "relates_to",
    metadata: {},
    created_at: "2026-08-19T00:00:00.000Z",
  };
  LinkSuccessSchema.parse({
    edge,
    activity_id: "44444444-4444-4444-8444-444444444444",
    links: [{ edge, activity_id: "44444444-4444-4444-8444-444444444444" }],
  });
  LinkSuccessSchema.parse({
    links: [{ edge, activity_id: "44444444-4444-4444-8444-444444444444" }],
  });
});

test("upsert create accepts allow_duplicate", () => {
  const parsed = UpsertInputSchema.parse({
    type: "person",
    title: "Priya Shah",
    allow_duplicate: true,
  });
  assert.equal(parsed.allow_duplicate, true);
});

test("manage_type accepts hue and glyph", () => {
  const parsed = ManageTypeInputSchema.parse({
    action: "update",
    slug: "task",
    hue: "green",
    glyph: "CircleCheck",
  });
  assert.equal(parsed.hue, "green");
  assert.equal(parsed.glyph, "CircleCheck");
  assert.throws(() => ManageTypeInputSchema.parse({ action: "update", slug: "task", hue: "#00ff00" }));
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
