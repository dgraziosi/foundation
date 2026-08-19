import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

async function collect(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(path)));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(path);
    }
  }
  return files;
}

test("viewer source has no write controls", async () => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const files = await collect(root);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, />\s*(Upsert|Delete|Link|Unlink|Undo|Confirm)\s*</);
    assert.doesNotMatch(text, /manage_type/);
  }
});
