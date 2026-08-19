import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = dirname(fileURLToPath(import.meta.url));

test("chrome uses shadcn primitives, not homemade fields", async () => {
  const files = [
    "pages/UnlockPage.tsx",
    "pages/GraphPage.tsx",
    "pages/SearchPage.tsx",
    "pages/RecentsPage.tsx",
    "pages/TasksPage.tsx",
    "shell/Rail.tsx",
    "shell/Inspector.tsx",
    "ui/Tags.tsx",
    "ui/States.tsx",
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
  const tasks = await readFile(join(root, "pages/TasksPage.tsx"), "utf8");
  assert.match(tasks, /from "@\/components\/ui\/card"/);
  const tags = await readFile(join(root, "ui/Tags.tsx"), "utf8");
  assert.match(tags, /from "@\/components\/ui\/badge"/);
});

test("Search snippets render FTS highlights instead of raw <b> tags", async () => {
  const search = await readFile(join(root, "pages/SearchPage.tsx"), "utf8");
  assert.match(search, /parseSearchSnippet/);
  assert.doesNotMatch(search, /\{hit\.snippet\}/);
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
  assert.match(shell, /md:grid-cols-\[180px_minmax\(0,1fr\)\]/);
  assert.match(shell, /xl:grid-cols-\[180px_minmax\(0,1fr\)_352px\]/);

  const inspector = await readFile(join(root, "shell/Inspector.tsx"), "utf8");
  assert.match(inspector, /max-md:w-full/);
  assert.match(inspector, /max-xl:w-\[min\(352px,100%\)\]/);

  const rail = await readFile(join(root, "shell/Rail.tsx"), "utf8");
  assert.match(rail, /max-md:flex-row/);

  const tasks = await readFile(join(root, "pages/TasksPage.tsx"), "utf8");
  assert.match(tasks, /md:grid-cols-3/);
});

test("row chrome wraps titles without changing every Button", async () => {
  const button = await readFile(join(root, "components/ui/button.tsx"), "utf8");
  assert.match(button, /whitespace-nowrap/);
  assert.match(button, /row:\s*"h-auto min-h-9 whitespace-normal/);

  for (const file of ["pages/SearchPage.tsx", "pages/RecentsPage.tsx", "pages/TasksPage.tsx", "shell/Inspector.tsx"]) {
    const text = await readFile(join(root, file), "utf8");
    assert.match(text, /size="row"/, `${file} should use the row Button size`);
  }
});
