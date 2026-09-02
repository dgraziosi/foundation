import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeActivityCursor,
  encodeSearchCursor,
  parseActivityCursor,
  parseSearchCursor,
} from "./list-page.js";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const STAMP = "2026-08-21T00:00:00.000Z";

test("search cursor round-trips and refuses junk", () => {
  const encoded = encodeSearchCursor({ rank: 0.25, updated_at: STAMP, id: NODE_ID });
  assert.equal(encoded.startsWith("s1."), true);
  assert.deepEqual(parseSearchCursor(encoded), { rank: 0.25, updated_at: STAMP, id: NODE_ID });
  assert.equal(parseSearchCursor("not-a-cursor"), undefined);
  assert.equal(parseSearchCursor(encodeActivityCursor({ created_at: STAMP, id: NODE_ID })), undefined);
});

test("activity cursor round-trips and refuses junk", () => {
  const encoded = encodeActivityCursor({ created_at: STAMP, id: NODE_ID });
  assert.equal(encoded.startsWith("a1."), true);
  assert.deepEqual(parseActivityCursor(encoded), { created_at: STAMP, id: NODE_ID });
  assert.equal(parseActivityCursor("a1.%%%"), undefined);
  assert.equal(parseActivityCursor(encodeSearchCursor({ rank: 0, updated_at: STAMP, id: NODE_ID })), undefined);
});

test("activity cursor keeps microsecond created_at", () => {
  const created_at = "2026-09-02T12:00:00.100500Z";
  const encoded = encodeActivityCursor({ created_at, id: NODE_ID });
  assert.deepEqual(parseActivityCursor(encoded), { created_at, id: NODE_ID });
});
