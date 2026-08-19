import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  GRAPH_GLYPH_PX,
  GRAPH_TITLE_PX,
  GRAPH_TYPE_PX,
  graphScreenFont,
  typeMarkLabel,
} from "./marks.js";

const root = dirname(fileURLToPath(import.meta.url));

test("graph marks use Lucide and keep type text at 12px", async () => {
  const marks = await readFile(join(root, "marks.ts"), "utf8");
  const canvas = await readFile(join(root, "GraphCanvas.tsx"), "utf8");
  const src = `${marks}\n${canvas}`;
  assert.match(marks, /typeIcon/);
  assert.match(marks, /lucideGlyphImage/);
  assert.match(marks, /renderToStaticMarkup/);
  assert.match(canvas, /paintGraphMark/);
  assert.doesNotMatch(src, /slice\(\s*0\s*,\s*1\s*\)/);
  assert.doesNotMatch(src, /9\s*\/\s*Math\.max|10\s*\/\s*Math\.max/);
  assert.doesNotMatch(src, /`\$\{9 |`\$\{10 |9px|10px/);
  assert.equal(GRAPH_GLYPH_PX, 16);
  assert.equal(GRAPH_TYPE_PX, 12);
  assert.equal(GRAPH_TITLE_PX, 11);
});

test("type mark label is the type label, not the slug", () => {
  assert.equal(typeMarkLabel("task", [{ slug: "task", label: "Task" }]), "Task");
  assert.equal(typeMarkLabel("note", [{ slug: "note", label: "Note" }]), "Note");
  assert.notEqual(typeMarkLabel("task", [{ slug: "task", label: "Task" }]), "task");
});

test("graph type and title stay at 12px and 11px on screen when zoomed", () => {
  for (const scale of [0.5, 0.75, 1, 1.6]) {
    assert.equal(graphScreenFont(GRAPH_TYPE_PX, scale) * scale, GRAPH_TYPE_PX);
    assert.equal(graphScreenFont(GRAPH_TITLE_PX, scale) * scale, GRAPH_TITLE_PX);
    assert.ok(graphScreenFont(GRAPH_TYPE_PX, scale) * scale >= 12);
    assert.ok(graphScreenFont(GRAPH_TITLE_PX, scale) * scale >= 11);
  }
});
