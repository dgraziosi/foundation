import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GRAPH_GLYPH_PX, GRAPH_NODE_PX, graphScreenFont, typeMarkLabel } from "./marks.js";
import { GENERIC_MARK, NEUTRAL_INK, typeColors, typeIcon } from "../type-meta.js";

const root = dirname(fileURLToPath(import.meta.url));

test("graph marks use Lucide and a type-colored node", async () => {
  const marks = await readFile(join(root, "marks.ts"), "utf8");
  const canvas = await readFile(join(root, "GraphCanvas.tsx"), "utf8");
  const src = `${marks}\n${canvas}`;
  assert.match(marks, /typeIcon/);
  assert.match(marks, /drawLucideGlyph/);
  assert.match(marks, /renderToStaticMarkup/);
  assert.match(canvas, /paintGraphMark/);
  assert.doesNotMatch(src, /slice\(\s*0\s*,\s*1\s*\)/);
  assert.equal(GRAPH_GLYPH_PX, 16);
  assert.equal(GRAPH_NODE_PX, 28);
});

test("type mark label is the type label, not the slug", () => {
  assert.equal(typeMarkLabel("task", [{ slug: "task", label: "Task" }]), "Task");
  assert.equal(typeMarkLabel("note", [{ slug: "note", label: "Note" }]), "Note");
  assert.notEqual(typeMarkLabel("task", [{ slug: "task", label: "Task" }]), "task");
});

test("graph node size stays on screen when zoomed", () => {
  for (const scale of [0.5, 0.75, 1, 1.6]) {
    assert.equal(graphScreenFont(GRAPH_NODE_PX, scale) * scale, GRAPH_NODE_PX);
    assert.equal(graphScreenFont(GRAPH_GLYPH_PX, scale) * scale, GRAPH_GLYPH_PX);
  }
});

test("missing hue and glyph fall back to neutral ink and a generic mark", () => {
  const colors = typeColors({}, "dark");
  assert.equal(colors.ink, NEUTRAL_INK);
  assert.equal(typeIcon({}), GENERIC_MARK);
  const green = typeColors({ hue: "green", glyph: "CircleCheck" }, "dark");
  assert.notEqual(green.ink, NEUTRAL_INK);
  assert.notEqual(typeIcon({ glyph: "CircleCheck" }), GENERIC_MARK);
});
