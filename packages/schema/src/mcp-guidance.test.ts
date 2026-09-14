import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  ADVERTISED_MCP_PROMPTS,
  ADVERTISED_MCP_RESOURCES,
  STARTER_MCP_PROMPT_NAMES,
  advertisedMcpPrompt,
  advertisedMcpPromptBody,
  advertisedMcpPromptNames,
  advertisedMcpResource,
  advertisedMcpResourceUris,
} from "./mcp-guidance.js";
import { schemaPackageRepoRoot } from "./mcp-inventory.js";
import { BootstrapOutputSchema } from "./types.js";

test("advertised MCP resources use foundation://guidance URIs and markdown bodies", () => {
  const uris = advertisedMcpResourceUris();
  assert.ok(uris.length >= 9);
  assert.ok(uris.every((uri) => uri.startsWith("foundation://guidance/")));
  assert.deepEqual(uris, [...new Set(uris)]);
  const nodes = advertisedMcpResource("foundation://guidance/nodes");
  assert.match(nodes.text, /data\.url: null clears the href/);
  assert.equal(nodes.text.includes("Url is not unique"), false);
  assert.equal(nodes.text.includes("url: null clears; omit the key to leave url unchanged"), false);
  assert.match(nodes.text, /upsert/);
  const search = advertisedMcpResource("foundation://guidance/search");
  assert.match(search.text, /data_equals/);
  assert.match(search.text, /full-text/);
  assert.match(search.text, /call lookup/);
  const lookup = advertisedMcpResource("foundation://guidance/lookup");
  assert.match(lookup.text, /lookup resolves/);
  assert.match(lookup.text, /not a probability/);
  assert.match(lookup.text, /working_set/);
  const links = advertisedMcpResource("foundation://guidance/links");
  assert.match(links.text, /edges\[\]/);
  assert.match(links.text, /one transaction writes all edges or none/);
  const activity = advertisedMcpResource("foundation://guidance/activity");
  assert.match(activity.text, /list_activity/);
  const working = advertisedMcpResource("foundation://guidance/working-set");
  assert.match(working.text, /actionable working set/);
  const howTo = advertisedMcpResource("foundation://guidance/how-to-extend");
  assert.match(howTo.text, /instance routines/);
  assert.match(howTo.text, /docs\/VAULT_HEALTH\.md/);
  assert.match(howTo.text, /Vault health/);
  assert.match(howTo.text, /Do not add get_vault_health/);
  assert.equal(
    ADVERTISED_MCP_RESOURCES.every((entry) => entry.mimeType === "text/markdown" && entry.text.startsWith("# ")),
    true,
  );
});

test("advertised MCP prompts include the three starter bot recipes", () => {
  const names = advertisedMcpPromptNames();
  for (const name of STARTER_MCP_PROMPT_NAMES) {
    assert.ok(names.includes(name), name);
  }
  const repoRoot = schemaPackageRepoRoot();
  for (const name of STARTER_MCP_PROMPT_NAMES) {
    const prompt = advertisedMcpPrompt(name);
    const body = advertisedMcpPromptBody(prompt, repoRoot);
    const file = readFileSync(path.join(repoRoot, prompt.sourceRel), "utf8");
    assert.equal(body, file);
    assert.match(body, /^# /);
    assert.match(body, /## Job/);
    assert.match(body, /## Responsibilities/);
    assert.match(body, /## Standards/);
  }
  assert.equal(ADVERTISED_MCP_PROMPTS.length, names.length);
});

test("lean bootstrap output is spine, types, relations, and rules", () => {
  const parsed = BootstrapOutputSchema.parse({
    spine: { diagram: "area → project → goal → habit | task", root: "area", description: "Area is the spine root." },
    types: [],
    relations: [],
    rules: {
      identity: "uuid",
      payloads: "typed",
      destructive_scope: true,
      actor_label: "root",
      ontology_writable: true,
      no_proposal_inbox: true,
      edges_are_source_of_truth: true,
      hierarchy_relation: "child_of",
    },
  });
  assert.deepEqual(Object.keys(parsed), ["spine", "types", "relations", "rules"]);
  assert.equal("how_to_extend" in parsed, false);
  const stripped = BootstrapOutputSchema.parse({
    ...parsed,
    how_to_extend: { summary: "essay" },
  });
  assert.equal("how_to_extend" in stripped, false);
});
