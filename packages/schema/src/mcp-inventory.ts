import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z, type ZodTypeAny } from "zod";
import { JobInputSchema } from "./job-lease.js";
import {
  DeleteInputSchema,
  GetInputSchema,
  InspectOntologyInputSchema,
  LinkInputSchema,
  ListActivityInputSchema,
  LookupInputSchema,
  ManageRelationInputSchema,
  ManageTypeInputSchema,
  SearchInputListedSchema,
  UndoInputSchema,
  UnlinkInputSchema,
  UpsertInputSchema,
  WorkingSetInputSchema,
} from "./mcp-io.js";

export const ADVERTISED_MCP_TOOL_NAMES = [
  "bootstrap",
  "search",
  "lookup",
  "get",
  "working_set",
  "upsert",
  "delete",
  "link",
  "unlink",
  "inspect_ontology",
  "manage_type",
  "manage_relation",
  "list_activity",
  "undo",
  "job",
] as const;

export type AdvertisedMcpToolName = (typeof ADVERTISED_MCP_TOOL_NAMES)[number];

export type AdvertisedMcpTool = {
  name: AdvertisedMcpToolName;
  description: string;
  purpose: string;
  input: ZodTypeAny;
};

const ENUM_EXPAND_MAX = 6;

export const ADVERTISED_MCP_TOOLS: readonly AdvertisedMcpTool[] = [
  {
    name: "bootstrap",
    description:
      "Return starter spine, compact rules, and current type/relation inventory. Call first. How-to-extend lives on foundation://guidance resources.",
    purpose:
      "Return starter spine, compact rules, and current type/relation inventory. Call first. How-to-extend lives on foundation://guidance resources.",
    input: z.object({}),
  },
  {
    name: "search",
    description:
      "Find nodes by text query and optional filters (type, status, under, since, url, repo, receipt, due overdue|today, due_on_or_before, due_on_or_after, data_equals). Query is optional when a filter is set. Hits include data.due when present. search { url } looks up a Gmail, Calendar, or Drive object, then get. search { repo } looks up a GitHub object, then get. search { receipt } looks up a sent-mail or cleared-event receipt, then get. If you already have a UUID, call get. To resolve one or more entity names to UUIDs, call lookup — do not serial-search. Link is the edge tool, not a search filter.",
    purpose:
      "Find nodes by text query and/or filters (`type`, `status`, `under`, `since`, `url`, `repo`, `receipt`, `due`, `due_on_or_before`, `due_on_or_after`, `data_equals`). Query is optional when a filter is set. Hits are id/type/title/snippet plus `due` when set.",
    input: SearchInputListedSchema,
  },
  {
    name: "lookup",
    description:
      "Resolve one or more entity names to live nodes. Returns a result per input (exact, alias, candidate, ambiguous, or no_match). Unique UUID, unique folded title, or unique user alias may bind a UUID. Token and fuzzy matches are candidates only — ask the user to confirm a UUID before any mutation that depends on the identity. get is safe for inspection. Each useful candidate includes id, type, canonical title, updated_at, match, and confidence, plus the surrounding candidates list. confidence ranks; it is not a probability and does not authorize a write. Read-only: never writes, merges, or picks an ambiguous candidate. If you already have a UUID, call get. For listing, url, repo, receipt, or payload search, use search.",
    purpose:
      "Resolve one or more names to live nodes. One result per input (`exact` / `alias` / `candidate` / `ambiguous` / `no_match`). Read-only.",
    input: LookupInputSchema,
  },
  {
    name: "get",
    description:
      "Fetch a node by id, including payload, incident edges with neighbor titles, and suggested_links from title FTS when a live neighbor looks related. Suggestions never write an edge.",
    purpose:
      "Return the record: payload, data, incident edges with neighbor titles, and `suggested_links` from title FTS. Does not return activity. Blob payloads return metadata, not bytes.",
    input: GetInputSchema,
  },
  {
    name: "working_set",
    description:
      "Return the actionable working set around one live node: open work, dues, and the parent chain when the root hangs under something. Read-only. If you already have a UUID, call this for the agenda; call get for the node. After lookup binds a name, this is the one agenda call.",
    purpose:
      "Return the actionable working set around one live node: open work, dues, and the parent chain when the root hangs under something.",
    input: WorkingSetInputSchema,
  },
  {
    name: "upsert",
    description:
      "Create or update one node or nodes[] (1–20). Pass one node (type, title, …) or nodes[], not both. The whole batch validates, then one transaction writes all or none. dry_run: true returns would-be snapshots and writes nothing. Missing type needed fields warn; strict: true refuses. Updates require base_updated_at (if-match). Changing type revalidates live incident edges; an edge the new type would not allow returns { error, suggestion } (unlink first). data JSONB-merges and is checked against the type json_schema. url { system, id } is unique on live nodes (gmail | calendar | drive). url: null clears that identity. Search { url } finds it. data.url is an optional https address (no credentials); that string is not unique and is not which Drive / Gmail / Calendar object. data.repo.{system,id} is unique on live nodes (github). repo: null clears. data.receipt.{system,id,kind} is unique on live nodes (done: gmail/sent or calendar/cleared). receipt: null clears. The server does not invent the receipt. Optional data.aliases is a user-authored string array (pass aliases: [] to clear; omit the key to leave aliases unchanged; punctuation-only values refuse and do not clear). Create (no id) runs the same lookup matcher: exact title or unique exact alias returns those candidates and does not write unless allow_duplicate is true. Token/fuzzy/compact matches warn and do not block. Create accepts idempotency_key. Activity actor is the key that authenticated. Returns suggested_links (child_of / about / relates_to) from title FTS — proposals only; call link after the user accepts.",
    purpose:
      "Create or update one node or `nodes[]` (1–20). Whole batch validates; one transaction writes all or none. `dry_run: true` writes nothing. Missing needed fields warn; `strict: true` refuses. Always pass `type`. Updates require `base_updated_at`.",
    input: UpsertInputSchema,
  },
  {
    name: "delete",
    description:
      "Soft-delete a node. Needs a key with destructive scope and base_updated_at from get (if-match). Refuses when a live record still points at this id via a declared ref field; clear data.<field> with upsert, then retry.",
    purpose:
      "Soft-delete a node. Needs a key with destructive scope and `base_updated_at` from `get`.",
    input: DeleteInputSchema,
  },
  {
    name: "link",
    description:
      "Create typed edges after validation. Pass one edge (from_id, to_id, relation_type) or edges[] (1–20), not both. The whole batch validates, then one transaction writes all or none. dry_run: true returns would-be receipts and writes nothing. Each edge requires from_base_updated_at and to_base_updated_at (if-match); shared nodes use one agreed timestamp. Activity actor is the key that authenticated. Returns links[] (one receipt per edge). The one-edge form also returns edge and activity_id.",
    purpose:
      "Create typed edges after validation. One edge or `edges[]` (1–20). Whole batch validates; one transaction writes all or none. `dry_run: true` writes nothing. Requires endpoint if-match.",
    input: LinkInputSchema,
  },
  {
    name: "unlink",
    description:
      "Remove a typed edge. Needs a key with destructive scope and endpoint timestamps from get (if-match).",
    purpose:
      "Remove a typed edge. Needs a key with destructive scope and endpoint if-match.",
    input: UnlinkInputSchema,
  },
  {
    name: "inspect_ontology",
    description:
      "List type and relation registry rows (system + authored), including each type’s fields, view declarations, default_view, hue, and glyph.",
    purpose:
      "List type and relation registry rows (system + authored), including each type’s `fields`, view declarations, `default_view`, `hue`, and `glyph`.",
    input: InspectOntologyInputSchema,
  },
  {
    name: "manage_type",
    description:
      "Create, update, or retire a node type (fields + view declarations + hue/glyph). Applies immediately. System types may edit description, fields, hue, glyph, and filter/sort/group on existing view ids. Retire needs a key with destructive scope and refuses system types or types with live nodes. Soft-deleted nodes of that type need purge_deleted: true (same as undo of type create).",
    purpose:
      "Create, update, or retire a node type (including `fields`, view queries, hue, and glyph). Applies immediately. Retire needs a key with destructive scope.",
    input: ManageTypeInputSchema,
  },
  {
    name: "manage_relation",
    description: "Create or update a relation type. Applies immediately.",
    purpose: "Create or update a relation type. Applies immediately.",
    input: ManageRelationInputSchema,
  },
  {
    name: "list_activity",
    description:
      "Read the activity log (filter by action, target, since). Optional fields and diff_only.",
    purpose:
      "Read the diary (filter by action, target, since). `{ target: <node id> }` is the write history for that node (`before` / `after`).",
    input: ListActivityInputSchema,
  },
  {
    name: "undo",
    description:
      "Reverse a reversible activity row by id. Needs a key with destructive scope. Node and edge inversions require if-match timestamps from get. Undoing a type create while deleted nodes of that type remain requires purge_deleted: true. Undo of type retire restores the registry row.",
    purpose:
      "Reverse a reversible activity row by id. Needs a key with destructive scope. Node and edge inversions require if-match timestamps from `get`. Type-create undo with leftover deleted nodes needs `purge_deleted: true`.",
    input: UndoInputSchema,
  },
  {
    name: "job",
    description:
      "Claim a named instance routine, keep the claim alive, finish or release it, or read who holds it and when it last finished. Not a graph write. Not a queue. The token from claim is the proof; the API key is only who.",
    purpose:
      "Claim a named instance routine, keep the claim alive, finish or release it, or read who holds it and last run. Not a graph write.",
    input: JobInputSchema,
  },
];

export const ADVERTISED_MCP_INPUT_SCHEMAS: Record<AdvertisedMcpToolName, ZodTypeAny> =
  Object.fromEntries(ADVERTISED_MCP_TOOLS.map((tool) => [tool.name, tool.input])) as Record<
    AdvertisedMcpToolName,
    ZodTypeAny
  >;

export function advertisedMcpTool(name: AdvertisedMcpToolName): AdvertisedMcpTool {
  const tool = ADVERTISED_MCP_TOOLS.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`unknown advertised MCP tool: ${name}`);
  }
  return tool;
}

export function advertisedMcpToolNames(): AdvertisedMcpToolName[] {
  return [...ADVERTISED_MCP_TOOL_NAMES];
}

function typeName(schema: ZodTypeAny): string {
  return String(schema._def?.typeName ?? "");
}

export function unwrapZod(schema: ZodTypeAny): ZodTypeAny {
  let current = schema;
  const seen = new Set<ZodTypeAny>();
  while (!seen.has(current)) {
    seen.add(current);
    const name = typeName(current);
    if (
      name === "ZodOptional" ||
      name === "ZodNullable" ||
      name === "ZodDefault" ||
      name === "ZodCatch" ||
      name === "ZodBranded" ||
      name === "ZodReadonly" ||
      name === "ZodPromise"
    ) {
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    if (name === "ZodEffects") {
      current = current._def.schema as ZodTypeAny;
      continue;
    }
    if (name === "ZodPipeline") {
      current = current._def.in as ZodTypeAny;
      continue;
    }
    break;
  }
  return current;
}

export function fieldDescription(schema: ZodTypeAny): string {
  const seen = new Set<ZodTypeAny>();
  let current: ZodTypeAny | undefined = schema;
  while (current && !seen.has(current)) {
    seen.add(current);
    const desc = typeof current.description === "string" ? current.description.trim() : "";
    if (desc) {
      return desc;
    }
    const name = typeName(current);
    if (
      name === "ZodOptional" ||
      name === "ZodNullable" ||
      name === "ZodDefault" ||
      name === "ZodCatch" ||
      name === "ZodBranded" ||
      name === "ZodReadonly" ||
      name === "ZodPromise"
    ) {
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    if (name === "ZodEffects") {
      current = current._def.schema as ZodTypeAny;
      continue;
    }
    break;
  }
  return "";
}

export function isAdvertisedOptional(schema: ZodTypeAny): boolean {
  const seen = new Set<ZodTypeAny>();
  let current = schema;
  while (!seen.has(current)) {
    seen.add(current);
    const name = typeName(current);
    if (name === "ZodOptional" || name === "ZodDefault") {
      return true;
    }
    if (
      name === "ZodNullable" ||
      name === "ZodCatch" ||
      name === "ZodBranded" ||
      name === "ZodReadonly" ||
      name === "ZodPromise"
    ) {
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    if (name === "ZodEffects") {
      current = current._def.schema as ZodTypeAny;
      continue;
    }
    break;
  }
  return false;
}

export type AdvertisedInputField = {
  path: string;
  description: string;
};

function walkAdvertisedFields(schema: ZodTypeAny, path: string, fields: AdvertisedInputField[]): void {
  const core = unwrapZod(schema);
  const name = typeName(core);
  if (name === "ZodObject") {
    const shape = core as z.ZodObject<z.ZodRawShape>;
    for (const [key, field] of Object.entries(shape.shape)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const description = fieldDescription(field as ZodTypeAny);
      if (path || description) {
        fields.push({ path: fieldPath, description });
      }
      walkAdvertisedFields(field as ZodTypeAny, fieldPath, fields);
    }
    return;
  }
  if (name === "ZodArray") {
    walkAdvertisedFields(core._def.type as ZodTypeAny, `${path}[]`, fields);
    return;
  }
  if (name === "ZodUnion" || name === "ZodDiscriminatedUnion") {
    const options = (core._def.options ?? []) as ZodTypeAny[];
    options.forEach((option, index) => {
      walkAdvertisedFields(option, `${path}|${index}`, fields);
    });
  }
}

export function advertisedInputFields(schema: ZodTypeAny, prefix = ""): AdvertisedInputField[] {
  const fields: AdvertisedInputField[] = [];
  walkAdvertisedFields(schema, prefix, fields);
  return fields;
}

export function missingAdvertisedInputDescriptions(
  schemas: Record<string, ZodTypeAny> = ADVERTISED_MCP_INPUT_SCHEMAS,
): string[] {
  const missing: string[] = [];
  for (const [tool, schema] of Object.entries(schemas)) {
    for (const field of advertisedInputFields(schema, tool)) {
      if (!field.description) {
        missing.push(field.path);
      }
    }
  }
  return missing;
}

function enumValues(schema: ZodTypeAny): string[] | undefined {
  const core = unwrapZod(schema);
  if (typeName(core) !== "ZodEnum") {
    return undefined;
  }
  const values = (core._def.values ?? []) as string[];
  return values.length > 0 && values.length <= ENUM_EXPAND_MAX ? values : undefined;
}

function objectShape(schema: ZodTypeAny): z.ZodRawShape | undefined {
  const core = unwrapZod(schema);
  if (typeName(core) !== "ZodObject") {
    return undefined;
  }
  return (core as z.ZodObject<z.ZodRawShape>).shape;
}

function isExpandableObject(schema: ZodTypeAny): boolean {
  const shape = objectShape(schema);
  if (!shape || Object.keys(shape).length === 0) {
    return false;
  }
  return Object.values(shape).every((field) => {
    const core = unwrapZod(field as ZodTypeAny);
    const name = typeName(core);
    return (
      name === "ZodString" ||
      name === "ZodNumber" ||
      name === "ZodBoolean" ||
      name === "ZodEnum" ||
      name === "ZodLiteral" ||
      name === "ZodUnknown"
    );
  });
}

function formatFieldSignature(name: string, schema: ZodTypeAny): string {
  const optional = isAdvertisedOptional(schema);
  const mark = optional ? "?" : "";
  const values = enumValues(schema);
  if (values) {
    return `${name}${mark}: ${values.map((value) => JSON.stringify(value)).join("|")}`;
  }
  const core = unwrapZod(schema);
  if (typeName(core) === "ZodArray") {
    const item = core._def.type as ZodTypeAny;
    if (isExpandableObject(item)) {
      return `${name}${mark}: [{ ${formatObjectSignature(item)} }]`;
    }
    return `${name}${mark}`;
  }
  if (isExpandableObject(schema)) {
    return `${name}${mark}: { ${formatObjectSignature(schema)} }`;
  }
  return `${name}${mark}`;
}

function formatObjectSignature(schema: ZodTypeAny): string {
  const shape = objectShape(schema);
  if (!shape) {
    return "";
  }
  return Object.entries(shape)
    .map(([key, field]) => formatFieldSignature(key, field as ZodTypeAny))
    .join(", ");
}

export function formatAdvertisedInputSignature(schema: ZodTypeAny): string {
  const shape = objectShape(schema);
  if (!shape || Object.keys(shape).length === 0) {
    return "none";
  }
  return `{ ${formatObjectSignature(schema)} }`;
}

export function renderMcpToolTableMarkdown(): string {
  const rows = ADVERTISED_MCP_TOOLS.map((tool) => `| \`${tool.name}\` | ${tool.purpose} |`);
  return ["| Tool | Purpose |", "| --- | --- |", ...rows].join("\n");
}

export function renderMcpToolParamsMarkdown(name: AdvertisedMcpToolName): string {
  const tool = advertisedMcpTool(name);
  const lines = [`- **In:** \`${formatAdvertisedInputSignature(tool.input)}\``];
  for (const field of advertisedInputFields(tool.input)) {
    if (!field.description || field.path.includes("|")) {
      continue;
    }
    lines.push(`- \`${field.path}\` — ${field.description}`);
  }
  return lines.join("\n");
}

export function renderMcpSkillInventoryMarkdown(): string {
  const names = ADVERTISED_MCP_TOOLS.map((tool) => `\`${tool.name}\``).join(", ");
  return [
    `Advertised tools (${ADVERTISED_MCP_TOOLS.length}): ${names}.`,
    "Generated from the advertised inventory in `@foundation/schema`. Look up the live schema at call time. Parameter docs: [`docs/MCP_TOOLS.md`](../../../docs/MCP_TOOLS.md).",
  ].join("\n");
}

const GENERATED_START = (name: string) => `<!-- generated:${name} -->`;
const GENERATED_END = (name: string) => `<!-- /generated:${name} -->`;

export function replaceGeneratedRegion(source: string, name: string, body: string): string {
  const start = GENERATED_START(name);
  const end = GENERATED_END(name);
  const startIdx = source.indexOf(start);
  const endIdx = source.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`missing generated region ${name}`);
  }
  const before = source.slice(0, startIdx + start.length);
  const after = source.slice(endIdx);
  return `${before}\n${body.trimEnd()}\n${after}`;
}

export function applyGeneratedMcpToolsDoc(source: string): string {
  let next = replaceGeneratedRegion(source, "mcp-tool-table", renderMcpToolTableMarkdown());
  for (const tool of ADVERTISED_MCP_TOOLS) {
    next = replaceGeneratedRegion(next, `mcp-params:${tool.name}`, renderMcpToolParamsMarkdown(tool.name));
  }
  return next;
}

export function applyGeneratedMcpSkill(source: string): string {
  return replaceGeneratedRegion(source, "mcp-skill-inventory", renderMcpSkillInventoryMarkdown());
}

export function schemaPackageRepoRoot(fromUrl = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(fromUrl)), "../../..");
}

export const MCP_TOOLS_DOC_REL = "docs/MCP_TOOLS.md";
export const FOUNDATION_MCP_SKILL_REL = ".agents/skills/foundation-mcp/SKILL.md";

export type GeneratedMcpDocsDrift = {
  path: string;
  region: string;
};

export function generatedMcpDocsFiles(repoRoot: string): { tools: string; skill: string } {
  return {
    tools: path.join(repoRoot, MCP_TOOLS_DOC_REL),
    skill: path.join(repoRoot, FOUNDATION_MCP_SKILL_REL),
  };
}

export function applyGeneratedMcpDocsToFiles(repoRoot: string): void {
  const files = generatedMcpDocsFiles(repoRoot);
  writeFileSync(files.tools, applyGeneratedMcpToolsDoc(readFileSync(files.tools, "utf8")));
  writeFileSync(files.skill, applyGeneratedMcpSkill(readFileSync(files.skill, "utf8")));
}

export function generatedMcpDocsDrift(repoRoot: string): GeneratedMcpDocsDrift[] {
  const files = generatedMcpDocsFiles(repoRoot);
  const drift: GeneratedMcpDocsDrift[] = [];
  const tools = readFileSync(files.tools, "utf8");
  if (tools !== applyGeneratedMcpToolsDoc(tools)) {
    drift.push({ path: MCP_TOOLS_DOC_REL, region: "generated MCP tool inventory" });
  }
  const skill = readFileSync(files.skill, "utf8");
  if (skill !== applyGeneratedMcpSkill(skill)) {
    drift.push({ path: FOUNDATION_MCP_SKILL_REL, region: "generated MCP skill inventory" });
  }
  return drift;
}
