import { ISO_DATE_PATTERN, isIsoDate } from "./due.js";

export const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/;

export const FIELD_KINDS = ["string", "date", "number", "enum", "ref"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_ROLES = ["title", "status", "date", "start", "end", "subtitle"] as const;
export type FieldRole = (typeof FIELD_ROLES)[number];

export const FIELD_SUGGESTION =
  "fields is an ordered array of { name, kind, display?, needed?, role?, enum_values?, ref_type? }. kind is string, date, number, enum, or ref. needed does not block capture. role is title, status, date, start, end, or subtitle.";

export type TypeField = {
  name: string;
  display: string;
  kind: FieldKind;
  needed: boolean;
  role?: FieldRole;
  enum_values?: string[];
  ref_type?: string;
};

function isFieldKind(value: string): value is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(value);
}

function isFieldRole(value: string): value is FieldRole {
  return (FIELD_ROLES as readonly string[]).includes(value);
}

function labelFromName(name: string): string {
  return name.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

export function fieldByRole(fields: readonly TypeField[], role: FieldRole): TypeField | undefined {
  return fields.find((field) => field.role === role);
}

export type ParsedFields =
  | { ok: true; fields: TypeField[] }
  | { ok: false; error: string; suggestion: string };

export function parseTypeFieldsInput(input: unknown, knownTypeSlugs?: readonly string[]): ParsedFields {
  if (input === undefined || input === null) {
    return { ok: true, fields: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: "fields must be an array", suggestion: FIELD_SUGGESTION };
  }
  const fields: TypeField[] = [];
  const names = new Set<string>();
  const roles = new Map<FieldRole, string>();
  for (const [index, raw] of input.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {
        ok: false,
        error: `fields[${index}] must be an object`,
        suggestion: FIELD_SUGGESTION,
      };
    }
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== "string" || !FIELD_NAME_RE.test(item.name)) {
      return {
        ok: false,
        error: `fields[${index}].name must be a slug`,
        suggestion: FIELD_SUGGESTION,
      };
    }
    if (names.has(item.name)) {
      return {
        ok: false,
        error: `Duplicate field name "${item.name}"`,
        suggestion: FIELD_SUGGESTION,
      };
    }
    if (typeof item.kind !== "string" || !isFieldKind(item.kind)) {
      return {
        ok: false,
        error: `fields[${index}].kind must be string, date, number, enum, or ref`,
        suggestion: FIELD_SUGGESTION,
      };
    }
    if (item.display !== undefined && typeof item.display !== "string") {
      return { ok: false, error: `fields[${index}].display must be a string`, suggestion: FIELD_SUGGESTION };
    }
    if (item.needed !== undefined && typeof item.needed !== "boolean") {
      return { ok: false, error: `fields[${index}].needed must be a boolean`, suggestion: FIELD_SUGGESTION };
    }
    let role: FieldRole | undefined;
    if (item.role !== undefined) {
      if (typeof item.role !== "string" || !isFieldRole(item.role)) {
        return { ok: false, error: `fields[${index}].role is not a known role`, suggestion: FIELD_SUGGESTION };
      }
      role = item.role;
      if (role !== "subtitle" && roles.has(role)) {
        return {
          ok: false,
          error: `Role "${role}" is already on field "${roles.get(role)}"`,
          suggestion: FIELD_SUGGESTION,
        };
      }
      roles.set(role, item.name);
    }
    if (role === "status" && item.kind !== "enum") {
      return { ok: false, error: "status role requires kind enum", suggestion: FIELD_SUGGESTION };
    }
    if ((role === "date" || role === "start" || role === "end") && item.kind !== "date") {
      return { ok: false, error: `${role} role requires kind date`, suggestion: FIELD_SUGGESTION };
    }
    let enumValues: string[] | undefined;
    if (item.kind === "enum") {
      if (!Array.isArray(item.enum_values) || item.enum_values.some((value) => typeof value !== "string")) {
        return {
          ok: false,
          error: `fields[${index}].enum_values is required for kind enum`,
          suggestion: FIELD_SUGGESTION,
        };
      }
      enumValues = item.enum_values as string[];
      if (enumValues.length === 0) {
        return { ok: false, error: "enum_values must not be empty", suggestion: FIELD_SUGGESTION };
      }
    }
    let refType: string | undefined;
    if (item.kind === "ref") {
      if (typeof item.ref_type !== "string" || !FIELD_NAME_RE.test(item.ref_type)) {
        return {
          ok: false,
          error: `fields[${index}].ref_type must be a type slug`,
          suggestion: FIELD_SUGGESTION,
        };
      }
      if (knownTypeSlugs && !knownTypeSlugs.includes(item.ref_type)) {
        return {
          ok: false,
          error: `Unknown ref_type "${item.ref_type}"`,
          suggestion: "Call inspect_ontology and pass a live type slug as ref_type.",
        };
      }
      refType = item.ref_type;
    }
    names.add(item.name);
    fields.push({
      name: item.name,
      display: typeof item.display === "string" && item.display.trim() ? item.display : labelFromName(item.name),
      kind: item.kind,
      needed: item.needed === true,
      ...(role ? { role } : {}),
      ...(enumValues ? { enum_values: enumValues } : {}),
      ...(refType ? { ref_type: refType } : {}),
    });
  }
  if (roles.has("end") && !roles.has("start")) {
    return { ok: false, error: "end role requires a start field", suggestion: FIELD_SUGGESTION };
  }
  return { ok: true, fields };
}

function schemaForKind(field: TypeField): Record<string, unknown> {
  if (field.kind === "date") {
    return {
      anyOf: [
        {
          type: "string",
          pattern: ISO_DATE_PATTERN,
          description: "ISO date YYYY-MM-DD (real calendar day)",
        },
        { type: "null" },
      ],
      description: `${field.display}. Optional. Pass null to clear.`,
    };
  }
  if (field.kind === "number") {
    return { type: ["number", "null"] };
  }
  if (field.kind === "enum") {
    return { type: ["string", "null"], enum: [...(field.enum_values ?? []), null] };
  }
  if (field.kind === "ref") {
    return {
      type: ["string", "null"],
      format: "uuid",
      description: `UUID of a ${field.ref_type ?? "node"}. Not an edge.`,
    };
  }
  return { type: ["string", "null"] };
}

/** Compiled validation document. additionalProperties stays true. needed is not required. */
export function compileJsonSchemaFromFields(fields: readonly TypeField[]): Record<string, unknown> | null {
  if (fields.length === 0) {
    return null;
  }
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    properties[field.name] = schemaForKind(field);
  }
  return {
    type: "object",
    additionalProperties: true,
    properties,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidString(value: string): boolean {
  return UUID_RE.test(value);
}

export function dateValueFromData(data: Record<string, unknown>, fieldName: string): string | undefined {
  const raw = data[fieldName];
  if (typeof raw !== "string" || !isIsoDate(raw)) {
    return undefined;
  }
  return raw;
}

export function mergeMissingFields(
  existing: readonly TypeField[],
  seed: readonly TypeField[],
): TypeField[] {
  const names = new Set(existing.map((field) => field.name));
  const next = [...existing];
  for (const field of seed) {
    if (!names.has(field.name)) {
      next.push(field);
      names.add(field.name);
    }
  }
  return next;
}

export function fieldsFromType(type: { fields?: readonly TypeField[] | null }): TypeField[] {
  return [...(type.fields ?? [])];
}
