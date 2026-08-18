/**
 * Name folding for lookup and alias dedupe. Must stay aligned with SQL
 * foundation_name_norm: public.unaccent, lower, non-alnum → space, trim.
 * Compact form drops remaining spaces and is never authoritative.
 */

import { UNACCENT_MAP } from "./unaccent-map.js";

export function foundationUnaccent(value: string): string {
  let out = "";
  for (const ch of value) {
    out += Object.prototype.hasOwnProperty.call(UNACCENT_MAP, ch) ? UNACCENT_MAP[ch]! : ch;
  }
  return out;
}

export function nameNorm(value: string): string {
  return foundationUnaccent(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameCompact(value: string): string {
  return nameNorm(value).replace(/ /g, "");
}

/** Fixtures that used to diverge between JS [a-z0-9] and SQL unaccent + [[:alnum:]]. */
export const NAME_NORM_ALIGNMENT_FIXTURES: ReadonlyArray<{ raw: string; norm: string; compact: string }> = [
  { raw: "Café Luna", norm: "cafe luna", compact: "cafeluna" },
  { raw: "O'Brien", norm: "o brien", compact: "obrien" },
  { raw: "ßtrasse", norm: "sstrasse", compact: "sstrasse" },
  { raw: "Straße", norm: "strasse", compact: "strasse" },
  { raw: "øl", norm: "ol", compact: "ol" },
  { raw: "Łódź", norm: "lodz", compact: "lodz" },
  { raw: "þing", norm: "thing", compact: "thing" },
  { raw: "Æsir", norm: "aesir", compact: "aesir" },
  { raw: "---", norm: "", compact: "" },
  { raw: "…", norm: "", compact: "" },
  { raw: "中", norm: "中", compact: "中" },
  { raw: "я", norm: "я", compact: "я" },
];

