import assert from "node:assert/strict";
import { test } from "node:test";
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

const ADVERTISED_MCP_INPUT_SCHEMAS: Record<string, ZodTypeAny> = {
  bootstrap: z.object({}),
  search: SearchInputListedSchema,
  lookup: LookupInputSchema,
  get: GetInputSchema,
  working_set: WorkingSetInputSchema,
  upsert: UpsertInputSchema,
  delete: DeleteInputSchema,
  link: LinkInputSchema,
  unlink: UnlinkInputSchema,
  inspect_ontology: InspectOntologyInputSchema,
  manage_type: ManageTypeInputSchema,
  manage_relation: ManageRelationInputSchema,
  list_activity: ListActivityInputSchema,
  undo: UndoInputSchema,
  job: JobInputSchema,
};

function typeName(schema: ZodTypeAny): string {
  return String(schema._def?.typeName ?? "");
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
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

function fieldDescription(schema: ZodTypeAny): string {
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

function walkAdvertisedFields(schema: ZodTypeAny, path: string, missing: string[]): void {
  const core = unwrap(schema);
  const name = typeName(core);
  if (name === "ZodObject") {
    const shape = core as z.ZodObject<z.ZodRawShape>;
    for (const [key, field] of Object.entries(shape.shape)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (!fieldDescription(field as ZodTypeAny)) {
        missing.push(fieldPath);
      }
      walkAdvertisedFields(field as ZodTypeAny, fieldPath, missing);
    }
    return;
  }
  if (name === "ZodArray") {
    walkAdvertisedFields(core._def.type as ZodTypeAny, `${path}[]`, missing);
    return;
  }
  if (name === "ZodUnion" || name === "ZodDiscriminatedUnion") {
    const options = (core._def.options ?? []) as ZodTypeAny[];
    options.forEach((option, index) => {
      walkAdvertisedFields(option, `${path}|${index}`, missing);
    });
  }
}

function missingAdvertisedInputDescriptions(
  schemas: Record<string, ZodTypeAny> = ADVERTISED_MCP_INPUT_SCHEMAS,
): string[] {
  const missing: string[] = [];
  for (const [tool, schema] of Object.entries(schemas)) {
    walkAdvertisedFields(schema, tool, missing);
  }
  return missing;
}

test("advertised MCP input schemas are the 15 registered tools", () => {
  assert.deepEqual(Object.keys(ADVERTISED_MCP_INPUT_SCHEMAS), [
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
  ]);
});

test("every advertised MCP input field has Zod .describe()", () => {
  const missing = missingAdvertisedInputDescriptions();
  assert.deepEqual(missing, [], `missing .describe() on: ${missing.join(", ")}`);
});

test("walker fails a field that has JSDoc but no .describe()", () => {
  const undocumented = z.object({
    id: z.string().uuid(),
  });
  const missing = missingAdvertisedInputDescriptions({ probe: undocumented });
  assert.deepEqual(missing, ["probe.id"]);
});
