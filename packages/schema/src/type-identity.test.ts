import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeMissingTypeIdentity,
  parseTypeIdentity,
  SEED_TYPE_IDENTITY,
  TYPE_HUES,
} from "./type-identity.js";

test("seed types carry a first-paint hue and Lucide glyph", () => {
  for (const slug of [
    "area",
    "project",
    "goal",
    "habit",
    "task",
    "lesson",
    "person",
    "place",
    "company",
    "journal",
    "idea",
    "note",
    "trip",
    "decision",
    "spend",
  ]) {
    const identity = SEED_TYPE_IDENTITY[slug];
    assert.ok(identity, slug);
    assert.ok((TYPE_HUES as readonly string[]).includes(identity.hue));
    assert.match(identity.glyph, /^[A-Z][A-Za-z0-9]*$/);
  }
  assert.equal(SEED_TYPE_IDENTITY.task?.hue, "green");
  assert.equal(SEED_TYPE_IDENTITY.task?.glyph, "CircleCheck");
  assert.equal(SEED_TYPE_IDENTITY.area?.hue, "red");
  assert.equal(SEED_TYPE_IDENTITY.project?.hue, "blue");
  assert.equal(SEED_TYPE_IDENTITY.spend?.hue, "teal");
  assert.equal(SEED_TYPE_IDENTITY.spend?.glyph, "Receipt");
});

test("parseTypeIdentity accepts named hue and Lucide glyph", () => {
  const parsed = parseTypeIdentity({ hue: "green", glyph: "CircleCheck" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.hue, "green");
  assert.equal(parsed.glyph, "CircleCheck");
});

test("parseTypeIdentity refuses unknown hue and lowercase glyph", () => {
  const hue = parseTypeIdentity({ hue: "#00a63e" });
  assert.equal(hue.ok, false);
  const glyph = parseTypeIdentity({ glyph: "circle-check" });
  assert.equal(glyph.ok, false);
});

test("parseTypeIdentity treats null as a clear", () => {
  const parsed = parseTypeIdentity({ hue: null, glyph: null });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.hue, null);
  assert.equal(parsed.glyph, null);
});

test("seed apply fills missing identity and keeps an operator edit", () => {
  const filled = mergeMissingTypeIdentity({}, SEED_TYPE_IDENTITY.task!);
  assert.equal(filled.hue, "green");
  assert.equal(filled.glyph, "CircleCheck");
  const kept = mergeMissingTypeIdentity({ hue: "rose", glyph: "Star" }, SEED_TYPE_IDENTITY.task!);
  assert.equal(kept.hue, "rose");
  assert.equal(kept.glyph, "Star");
});
