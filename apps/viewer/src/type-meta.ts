import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Circle,
  CircleCheck,
  Compass,
  FileText,
  Folder,
  GraduationCap,
  Lightbulb,
  MapPin,
  NotebookPen,
  Plane,
  Repeat,
  Split,
  Target,
  User,
} from "lucide-react";

export type HueName =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "pink"
  | "rose";

export type TypeHue = {
  name: HueName;
  lightTint: string;
  lightInk: string;
  darkTint: string;
  darkInk: string;
};

export const HUE_LIBRARY: Record<HueName, TypeHue> = {
  red: { name: "red", lightTint: "#ffe2e2", lightInk: "#e7000b", darkTint: "#460809", darkInk: "#ff6467" },
  orange: { name: "orange", lightTint: "#ffedd4", lightInk: "#f54900", darkTint: "#441306", darkInk: "#ff8904" },
  amber: { name: "amber", lightTint: "#fef3c6", lightInk: "#e17100", darkTint: "#461901", darkInk: "#ffb900" },
  yellow: { name: "yellow", lightTint: "#fef9c2", lightInk: "#d08700", darkTint: "#432004", darkInk: "#fcc800" },
  lime: { name: "lime", lightTint: "#ecfcca", lightInk: "#5ea500", darkTint: "#192e03", darkInk: "#9ae600" },
  green: { name: "green", lightTint: "#dcfce7", lightInk: "#00a63e", darkTint: "#032e15", darkInk: "#05df72" },
  emerald: { name: "emerald", lightTint: "#d0fae5", lightInk: "#009966", darkTint: "#002c22", darkInk: "#00d492" },
  teal: { name: "teal", lightTint: "#cbfbf1", lightInk: "#009689", darkTint: "#022f2e", darkInk: "#00d5be" },
  cyan: { name: "cyan", lightTint: "#cefafe", lightInk: "#0092b8", darkTint: "#053345", darkInk: "#00d3f2" },
  sky: { name: "sky", lightTint: "#dff2fe", lightInk: "#0084d1", darkTint: "#052f4a", darkInk: "#00bcff" },
  blue: { name: "blue", lightTint: "#dbeafe", lightInk: "#155dfc", darkTint: "#162456", darkInk: "#51a2ff" },
  indigo: { name: "indigo", lightTint: "#e0e7ff", lightInk: "#4f39f6", darkTint: "#1e1a4d", darkInk: "#7c86ff" },
  violet: { name: "violet", lightTint: "#ede9fe", lightInk: "#7f22fe", darkTint: "#2f0d68", darkInk: "#a684ff" },
  fuchsia: { name: "fuchsia", lightTint: "#fae8ff", lightInk: "#c800de", darkTint: "#4b004f", darkInk: "#ed6aff" },
  pink: { name: "pink", lightTint: "#fce7f3", lightInk: "#e60076", darkTint: "#510424", darkInk: "#fb64b6" },
  rose: { name: "rose", lightTint: "#ffe4e6", lightInk: "#ec003f", darkTint: "#4d0218", darkInk: "#ff637e" },
};

const AUTHORED_HUES: HueName[] = [
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
  "fuchsia",
  "pink",
  "rose",
];

export const SEED_TYPE_META: Record<string, { hue: HueName; icon: LucideIcon }> = {
  area: { hue: "red", icon: Compass },
  project: { hue: "blue", icon: Folder },
  goal: { hue: "amber", icon: Target },
  habit: { hue: "violet", icon: Repeat },
  task: { hue: "green", icon: CircleCheck },
  lesson: { hue: "cyan", icon: GraduationCap },
  person: { hue: "rose", icon: User },
  place: { hue: "amber", icon: MapPin },
  company: { hue: "emerald", icon: Building2 },
  journal: { hue: "orange", icon: NotebookPen },
  idea: { hue: "fuchsia", icon: Lightbulb },
  note: { hue: "sky", icon: FileText },
  trip: { hue: "orange", icon: Plane },
  decision: { hue: "indigo", icon: Split },
};

export function typeHueName(slug: string, knownSlugs: string[] = []): HueName {
  const seed = SEED_TYPE_META[slug];
  if (seed) {
    return seed.hue;
  }
  const used = new Map<HueName, number>();
  for (const name of AUTHORED_HUES) {
    used.set(name, 0);
  }
  for (const other of knownSlugs) {
    if (other === slug) {
      continue;
    }
    const hue = SEED_TYPE_META[other]?.hue ?? authoredHue(other, []);
    used.set(hue, (used.get(hue) ?? 0) + 1);
  }
  let least = AUTHORED_HUES[0];
  let count = Number.POSITIVE_INFINITY;
  for (const name of AUTHORED_HUES) {
    const n = used.get(name) ?? 0;
    if (n < count) {
      least = name;
      count = n;
    }
  }
  return least;
}

function authoredHue(slug: string, knownSlugs: string[]): HueName {
  let hash = 0;
  for (const char of slug) {
    hash = (hash + char.charCodeAt(0)) % AUTHORED_HUES.length;
  }
  if (knownSlugs.length === 0) {
    return AUTHORED_HUES[hash] ?? "sky";
  }
  return typeHueName(slug, knownSlugs);
}

export function typeIcon(slug: string): LucideIcon {
  return SEED_TYPE_META[slug]?.icon ?? Circle;
}

export function typeColors(
  slug: string,
  lane: "light" | "dark",
  knownSlugs: string[] = [],
): { tint: string; ink: string } {
  const hue = HUE_LIBRARY[typeHueName(slug, knownSlugs)];
  return lane === "light" ? { tint: hue.lightTint, ink: hue.lightInk } : { tint: hue.darkTint, ink: hue.darkInk };
}
