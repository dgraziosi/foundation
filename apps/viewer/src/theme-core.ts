export type ThemeChoice = "light" | "dark" | "system";
export type ThemeLane = "light" | "dark";
export type StoredTheme = ThemeChoice | "paper";

export type ThemeTokens = {
  bg: string;
  ink: string;
  accent: string;
  card: string;
  ink2: string;
};

export const LIGHT_TOKENS: ThemeTokens = {
  bg: "#fafafa",
  ink: "#171717",
  accent: "#171717",
  card: "#ffffff",
  ink2: "#737373",
};

export const DARK_TOKENS: ThemeTokens = {
  bg: "#0a0a0a",
  ink: "#ffffff",
  accent: "#ffffff",
  card: "#171717",
  ink2: "#a1a1a1",
};

/** Stored paper from Viewer v1 reads as Light. */
export function normalizeThemeChoice(value: string | null | undefined): ThemeChoice | undefined {
  if (value === "paper") {
    return "light";
  }
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return undefined;
}

const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyTheme(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function resolvedTheme(choice: ThemeChoice): ThemeLane {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

export function applyTheme(choice: ThemeChoice): ThemeLane {
  const lane = resolvedTheme(choice);
  document.documentElement.dataset.theme = lane;
  notifyTheme();
  return lane;
}

function readCss(name: string, fallback: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function themeLane(): ThemeLane {
  if (typeof document === "undefined") {
    return "dark";
  }
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Live lane tokens for canvas paint. Prefer computed CSS; fall back to the lane constants. */
export function readThemeTokens(): ThemeTokens {
  const fallback = themeLane() === "light" ? LIGHT_TOKENS : DARK_TOKENS;
  return {
    bg: readCss("--canvas", fallback.bg),
    ink: readCss("--ink", fallback.ink),
    accent: readCss("--accent", fallback.accent),
    card: readCss("--elevated", fallback.card),
    ink2: readCss("--ink-2", fallback.ink2),
  };
}

/** First paint, then every theme notification — not only the initial render. */
export function subscribeGraphPaint(onPaint: (tokens: ThemeTokens) => void): () => void {
  onPaint(readThemeTokens());
  return subscribeTheme(() => {
    onPaint(readThemeTokens());
  });
}

/** @deprecated Use LIGHT_TOKENS. Paper is Light. */
export const PAPER_TOKENS = LIGHT_TOKENS;
