/**
 * Name folding for lookup. Must stay aligned with SQL foundation_name_norm:
 * unaccent/case-fold, non-alphanumerics → space, collapse whitespace.
 * Compact form drops remaining spaces and is never authoritative.
 */

export function nameNorm(value: string): string {
  const stripped = value.normalize("NFKD").replace(/\p{M}/gu, "");
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameCompact(value: string): string {
  return nameNorm(value).replace(/ /g, "");
}
