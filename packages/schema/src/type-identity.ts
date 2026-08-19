import { z } from "zod";

/** Named hues a type may carry. Viewer maps these to ink/tint. */
export const TYPE_HUES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;
export type TypeHueName = (typeof TYPE_HUES)[number];

export const TYPE_HUE_SET = new Set<string>(TYPE_HUES);

export const TypeHueSchema = z.enum(TYPE_HUES);

/** Lucide export name (PascalCase). Viewer looks this up; unknown names fall back. */
export const TypeGlyphSchema = z
  .string()
  .regex(/^[A-Z][A-Za-z0-9]*$/, "glyph must be a Lucide icon name")
  .max(64);

export const TYPE_IDENTITY_SUGGESTION =
  "hue is a named type hue (red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose). glyph is a Lucide icon name (PascalCase).";

export type TypeIdentity = {
  hue?: TypeHueName;
  glyph?: string;
};

export function isTypeHueName(value: string): value is TypeHueName {
  return TYPE_HUE_SET.has(value);
}

export type ParsedTypeIdentity =
  | { ok: true; hue?: TypeHueName | null; glyph?: string | null }
  | { ok: false; error: string; suggestion: string };

export function parseTypeIdentity(input: { hue?: unknown; glyph?: unknown }): ParsedTypeIdentity {
  const out: { hue?: TypeHueName | null; glyph?: string | null } = {};
  if ("hue" in input && input.hue !== undefined) {
    if (input.hue === null) {
      out.hue = null;
    } else if (typeof input.hue === "string" && isTypeHueName(input.hue)) {
      out.hue = input.hue;
    } else {
      return { ok: false, error: "hue must be a named type hue", suggestion: TYPE_IDENTITY_SUGGESTION };
    }
  }
  if ("glyph" in input && input.glyph !== undefined) {
    if (input.glyph === null) {
      out.glyph = null;
    } else {
      const parsed = TypeGlyphSchema.safeParse(input.glyph);
      if (!parsed.success) {
        return { ok: false, error: "glyph must be a Lucide icon name", suggestion: TYPE_IDENTITY_SUGGESTION };
      }
      out.glyph = parsed.data;
    }
  }
  return { ok: true, ...out };
}

/** First-paint identity for seed types. Stored on the type; Viewer only reads. */
export const SEED_TYPE_IDENTITY: Record<string, { hue: TypeHueName; glyph: string }> = {
  area: { hue: "red", glyph: "Compass" },
  project: { hue: "blue", glyph: "Folder" },
  goal: { hue: "amber", glyph: "Target" },
  habit: { hue: "violet", glyph: "Repeat" },
  task: { hue: "green", glyph: "CircleCheck" },
  lesson: { hue: "cyan", glyph: "GraduationCap" },
  person: { hue: "rose", glyph: "User" },
  place: { hue: "amber", glyph: "MapPin" },
  company: { hue: "emerald", glyph: "Building2" },
  journal: { hue: "orange", glyph: "NotebookPen" },
  idea: { hue: "fuchsia", glyph: "Lightbulb" },
  note: { hue: "sky", glyph: "FileText" },
  trip: { hue: "orange", glyph: "Plane" },
  decision: { hue: "indigo", glyph: "Split" },
};

/** Fill missing seed hue/glyph only. Do not overwrite an operator edit. */
export function mergeMissingTypeIdentity(
  existing: { hue?: string | null; glyph?: string | null },
  seed: { hue?: TypeHueName; glyph?: string },
): { hue?: TypeHueName; glyph?: string } {
  const hue =
    existing.hue && isTypeHueName(existing.hue) ? existing.hue : seed.hue;
  const glyph =
    typeof existing.glyph === "string" && existing.glyph.trim() ? existing.glyph : seed.glyph;
  return {
    ...(hue ? { hue } : {}),
    ...(glyph ? { glyph } : {}),
  };
}
