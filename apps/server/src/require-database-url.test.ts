import assert from "node:assert/strict";
import { test } from "node:test";

test("DATABASE_URL is required so database tests cannot skip", () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required; refusing to skip database tests",
  );
});
