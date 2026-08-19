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
