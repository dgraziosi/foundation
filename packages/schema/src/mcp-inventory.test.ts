import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  ADVERTISED_MCP_INPUT_SCHEMAS,
  ADVERTISED_MCP_TOOL_NAMES,
  ADVERTISED_MCP_TOOLS,
  advertisedMcpTool,
  applyGeneratedMcpSkill,
  formatAdvertisedInputSignature,
  generatedMcpDocsDrift,
  missingAdvertisedInputDescriptions,
  renderMcpToolParamsMarkdown,
  renderMcpToolTableMarkdown,
  schemaPackageRepoRoot,
} from "./mcp-inventory.js";

test("advertised MCP inventory is the 16 registered tools in register order", () => {
  assert.deepEqual(
    ADVERTISED_MCP_TOOLS.map((tool) => tool.name),
    [
      "bootstrap",
      "search",
      "lookup",
      "get",
      "working_set",
      "upsert",
      "delete",
      "merge",
      "link",
      "unlink",
      "inspect_ontology",
      "manage_type",
      "manage_relation",
      "list_activity",
      "undo",
      "job",
    ],
  );
  assert.deepEqual(Object.keys(ADVERTISED_MCP_INPUT_SCHEMAS), [...ADVERTISED_MCP_TOOL_NAMES]);
  assert.equal(advertisedMcpTool("search").input, ADVERTISED_MCP_INPUT_SCHEMAS.search);
});

test("upsert advertised In signature keeps top-level url?", () => {
  const signature = formatAdvertisedInputSignature(ADVERTISED_MCP_INPUT_SCHEMAS.upsert);
  assert.match(signature, /url\?/);
  assert.match(signature, /type/);
  assert.doesNotMatch(signature, /payload\?, data\?, status\?, metadata\?, base_updated_at\?/);
});

test("search advertised In signature lists listed filters", () => {
  const signature = formatAdvertisedInputSignature(ADVERTISED_MCP_INPUT_SCHEMAS.search);
  assert.match(signature, /query\?/);
  assert.match(signature, /url\?/);
  assert.match(signature, /repo\?/);
  assert.match(signature, /receipt\?/);
});

test("generated parameter docs include Zod describe strings", () => {
  const search = renderMcpToolParamsMarkdown("search");
  assert.match(search, /\*\*In:\*\*/);
  assert.match(search, /`query` — Lexical query\. Optional when a filter is set/);
  assert.match(search, /`url.system` — gmail, calendar, or drive/);
  const upsert = renderMcpToolParamsMarkdown("upsert");
  assert.match(upsert, /`url` — Unique Drive, Gmail, or Calendar identity/);
  const job = renderMcpToolParamsMarkdown("job");
  assert.match(job, /`action` — claim, finish, release, or read/);
  const activity = renderMcpToolParamsMarkdown("list_activity");
  assert.match(activity, /`diff_only` — When true, before and after keep only changed top-level keys/);
});

test("generated tool table lists every advertised tool", () => {
  const table = renderMcpToolTableMarkdown();
  for (const name of ADVERTISED_MCP_TOOL_NAMES) {
    assert.match(table, new RegExp(`\\| \`${name}\` \\|`));
  }
});

test("docs and skill generated regions match the advertised inventory", () => {
  const drift = generatedMcpDocsDrift(schemaPackageRepoRoot());
  assert.deepEqual(drift, [], drift.map((item) => `${item.path} (${item.region})`).join(", "));
});

test("check fails when a generated region is edited by hand", () => {
  const skill = `---\n---\n\n<!-- generated:mcp-skill-inventory -->\nstale\n<!-- /generated:mcp-skill-inventory -->\n`;
  const rewritten = applyGeneratedMcpSkill(skill);
  assert.notEqual(rewritten, skill);
  assert.match(rewritten, /`bootstrap`/);
  assert.match(rewritten, /`job`/);
});

test("walker fails a field that has JSDoc but no .describe()", () => {
  const undocumented = z.object({
    id: z.string().uuid(),
  });
  const missing = missingAdvertisedInputDescriptions({ probe: undocumented });
  assert.deepEqual(missing, ["probe.id"]);
});
