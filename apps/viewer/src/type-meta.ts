import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Circle,
  CircleCheck,
  Compass,
  FileText,
  Folder,
  GraduationCap,
  Hash,
  Lightbulb,
  MapPin,
  NotebookPen,
  Plane,
  Repeat,
  Split,
  Star,
  Tag,
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
  | "purple"
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
  purple: { name: "purple", lightTint: "#f3e8ff", lightInk: "#9810fa", darkTint: "#3c0366", darkInk: "#c27aff" },
  fuchsia: { name: "fuchsia", lightTint: "#fae8ff", lightInk: "#c800de", darkTint: "#4b004f", darkInk: "#ed6aff" },
  pink: { name: "pink", lightTint: "#fce7f3", lightInk: "#e60076", darkTint: "#510424", darkInk: "#fb64b6" },
  rose: { name: "rose", lightTint: "#ffe4e6", lightInk: "#ec003f", darkTint: "#4d0218", darkInk: "#ff637e" },
};

const GLYPHS: Record<string, LucideIcon> = {
  Building2,
  Circle,
  CircleCheck,
  Compass,
  FileText,
  Folder,
  GraduationCap,
  Hash,
  Lightbulb,
  MapPin,
  NotebookPen,
  Plane,
  Repeat,
  Split,
  Star,
  Tag,
  Target,
  User,
};

export const NEUTRAL_INK = "#737373";
export const GENERIC_MARK = Circle;

export type TypeIdentity = {
  slug?: string;
  hue?: string;
  glyph?: string;
};

function isHueName(value: string | undefined): value is HueName {
  return Boolean(value && value in HUE_LIBRARY);
}

export function typeColors(
  identity: TypeIdentity | undefined,
  lane: "light" | "dark",
): { tint: string; ink: string } {
  if (!identity?.hue || !isHueName(identity.hue)) {
    return { tint: "transparent", ink: NEUTRAL_INK };
  }
  const hue = HUE_LIBRARY[identity.hue];
  return lane === "light" ? { tint: hue.lightTint, ink: hue.lightInk } : { tint: hue.darkTint, ink: hue.darkInk };
}

export function typeIcon(identity: TypeIdentity | undefined): LucideIcon {
  const name = identity?.glyph?.trim();
  if (name && GLYPHS[name]) {
    return GLYPHS[name]!;
  }
  return GENERIC_MARK;
}

export function identityFor(
  slug: string,
  types?: ReadonlyArray<TypeIdentity & { slug: string }>,
): TypeIdentity {
  return types?.find((type) => type.slug === slug) ?? { slug };
}
