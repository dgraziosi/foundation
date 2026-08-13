import { Ajv } from "ajv";
import { toolError, type ToolError } from "./mcp-io.js";

const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });

function formatAjvErrors(errors: readonly { instancePath?: string; message?: string | null }[]): string {
  return errors
    .map((err) => `${err.instancePath || "/"} ${err.message ?? "is invalid"}`.trim())
    .join("; ");
}

/**
 * Validate node `data` against the type's stored JSON Schema.
 * `null` / omitted schema skips the check. On miss return `{ error, suggestion }`.
 */
export function validateDataAgainstJsonSchema(
  data: Record<string, unknown>,
  jsonSchema: unknown,
  typeSlug: string,
): ToolError | null {
  if (jsonSchema === null || jsonSchema === undefined) {
    return null;
  }
  if (jsonSchema === true) {
    return null;
  }
  if (jsonSchema === false) {
    return toolError(
      `data does not match json_schema for type "${typeSlug}"`,
      `Call inspect_ontology for type "${typeSlug}". The schema rejects all data; fix json_schema with manage_type or omit invalid keys.`,
    );
  }
  if (typeof jsonSchema !== "object" || Array.isArray(jsonSchema)) {
    return toolError(
      `Type "${typeSlug}" has an invalid json_schema`,
      "Call inspect_ontology. json_schema must be a JSON Schema object (or null). Fix it with manage_type, then retry upsert.",
    );
  }

  let valid: boolean;
  try {
    const validate = ajv.compile(jsonSchema);
    valid = validate(data);
    if (valid) {
      return null;
    }
    const details = formatAjvErrors(validate.errors ?? []);
    return toolError(
      `data does not match json_schema for type "${typeSlug}"${details ? `: ${details}` : ""}`,
      `Call inspect_ontology for type "${typeSlug}". Fix data (or the type schema with manage_type) and retry upsert.`,
    );
  } catch {
    return toolError(
      `Type "${typeSlug}" has an invalid json_schema`,
      "Call inspect_ontology. Fix json_schema with manage_type, then retry upsert.",
    );
  }
}
