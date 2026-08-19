import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

test("chrome uses shadcn primitives, not homemade fields", async () => {
  const files = [
    "pages/UnlockPage.tsx",
    "graph/GraphCanvas.tsx",
    "pages/SearchPage.tsx",
    "pages/RecentsPage.tsx",
    "pages/HomePage.tsx",
    "pages/TypeViewPage.tsx",
    "shell/Rail.tsx",
    "shell/Inspector.tsx",
    "ui/Tags.tsx",
    "ui/States.tsx",
    "views/TypeViews.tsx",
  ];
  for (const file of files) {
    const text = await readFile(join(root, file), "utf8");
    assert.match(text, /@\/components\/ui\//, `${file} should import a shadcn primitive`);
    assert.doesNotMatch(text, /className="field"/, `${file} still has a homemade field`);
    assert.doesNotMatch(text, /<select[\s>]/, `${file} still has a raw select`);
  }
  const unlock = await readFile(join(root, "pages/UnlockPage.tsx"), "utf8");
  assert.match(unlock, /from "@\/components\/ui\/button"/);
  assert.match(unlock, /from "@\/components\/ui\/input"/);
  const rail = await readFile(join(root, "shell/Rail.tsx"), "utf8");
  assert.match(rail, /ToggleGroup/);
  assert.match(rail, /Home/);
  assert.match(rail, /Graph/);
  assert.match(rail, /Search/);
  assert.match(rail, /Recents/);
  assert.doesNotMatch(rail, /Tasks/);
  const board = await readFile(join(root, "views/TypeViews.tsx"), "utf8");
  assert.match(board, /from "@\/components\/ui\/card"/);
  assert.match(board, /No tasks yet/);
  const tags = await readFile(join(root, "ui/Tags.tsx"), "utf8");
  assert.match(tags, /from "@\/components\/ui\/badge"/);
  const sheet = await readFile(join(root, "components/ui/sheet.tsx"), "utf8");
  assert.match(sheet, /@radix-ui\/react-dialog/);
  const scroll = await readFile(join(root, "components/ui/scroll-area.tsx"), "utf8");
  assert.match(scroll, /@radix-ui\/react-scroll-area/);
  const tooltip = await readFile(join(root, "components/ui/tooltip.tsx"), "utf8");
  assert.match(tooltip, /@radix-ui\/react-tooltip/);
});

test("Search snippets render FTS highlights instead of raw <b> tags", async () => {
  const search = await readFile(join(root, "pages/SearchPage.tsx"), "utf8");
  assert.match(search, /parseSearchSnippet/);
  assert.match(search, /<SearchSnippet text=\{hit\.snippet\} \/>/);
  assert.doesNotMatch(search, />\{hit\.snippet\}</);
});

test("type Select viewport can grow past the trigger height", async () => {
  const select = await readFile(join(root, "components/ui/select.tsx"), "utf8");
  assert.doesNotMatch(select, /(?<!min-)h-\[var\(--radix-select-trigger-height\)\]/);
  assert.match(select, /min-h-\[var\(--radix-select-trigger-height\)\]/);
  assert.match(select, /max-h-96/);
});

test("shell stops match VIEWER.md: narrow <900, medium 900, wide 1280", async () => {
  const config = await readFile(join(root, "../tailwind.config.js"), "utf8");
  assert.match(config, /md:\s*"900px"/);
  assert.match(config, /xl:\s*"1280px"/);
  assert.doesNotMatch(config, /md:\s*"768px"/);

  const shell = await readFile(join(root, "shell/Shell.tsx"), "utf8");
  assert.match(shell, /bg-canvas/);
  assert.match(shell, /bg-elevated/);

  const rail = await readFile(join(root, "shell/Rail.tsx"), "utf8");
  assert.match(rail, /w-rail/);
  assert.match(rail, /max-md:fixed/);
  assert.match(rail, /max-md:-translate-x-full/);

  const inspector = await readFile(join(root, "shell/Inspector.tsx"), "utf8");
  assert.match(inspector, /xl:w-inspector/);
  assert.match(inspector, /Sheet/);
  assert.match(inspector, /inspectorSheetOpen/);
  assert.match(inspector, /useWideLane/);
  assert.match(inspector, /wide \? null/);

  const board = await readFile(join(root, "views/TypeViews.tsx"), "utf8");
  assert.match(board, /md:grid-cols-3/);
});

test("row chrome wraps titles without changing every Button", async () => {
  const button = await readFile(join(root, "components/ui/button.tsx"), "utf8");
  assert.match(button, /whitespace-nowrap/);
  assert.match(button, /row:\s*"h-auto min-h-row whitespace-normal/);

  for (const file of [
    "pages/SearchPage.tsx",
    "pages/RecentsPage.tsx",
    "pages/HomePage.tsx",
    "views/TypeViews.tsx",
    "shell/Inspector.tsx",
  ]) {
    const text = await readFile(join(root, file), "utf8");
    assert.match(text, /size="row"/, `${file} should use the row Button size`);
  }
});

test("Inter 400/500 only; no mono face and no weight 600", async () => {
  const main = await readFile(join(root, "main.tsx"), "utf8");
  assert.match(main, /@fontsource\/inter\/400/);
  assert.match(main, /@fontsource\/inter\/500/);
  assert.doesNotMatch(main, /inter\/600/);
  assert.doesNotMatch(main, /ibm-plex-mono/);
  const css = await readFile(join(root, "styles.css"), "utf8");
  assert.doesNotMatch(css, /--mono/);
});

test("graph canvas marks use Lucide, not a first-letter circle", async () => {
  const canvas = await readFile(join(root, "graph/GraphCanvas.tsx"), "utf8");
  const marks = await readFile(join(root, "graph/marks.ts"), "utf8");
  assert.match(canvas, /paintGraphMark/);
  assert.match(marks, /typeIcon/);
  assert.match(marks, /GRAPH_GLYPH_PX = 16/);
  assert.match(marks, /GRAPH_TYPE_PX = 12/);
  assert.match(marks, /GRAPH_TITLE_PX = 11/);
  assert.doesNotMatch(`${canvas}\n${marks}`, /slice\(\s*0\s*,\s*1\s*\)/);
  assert.doesNotMatch(`${canvas}\n${marks}`, /9\s*\/\s*Math\.max|10\s*\/\s*Math\.max|9px|10px/);
});

test("no-views copy is honest and Home is the landing surface", async () => {
  const typeView = await readFile(join(root, "pages/TypeViewPage.tsx"), "utf8");
  assert.match(typeView, /No views declared for this type/);
  assert.match(typeView, /resolveActiveView/);
  assert.match(typeView, /key=\{slug\}/);
  const app = await readFile(join(root, "App.tsx"), "utf8");
  assert.match(app, /path="\/" element=\{<HomePage/);
  assert.match(app, /path="\/graph"/);
  assert.match(app, /TypeViewRoute/);
  assert.doesNotMatch(app, /TasksPage/);
});
