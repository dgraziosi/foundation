export type ThemeChoice = "paper" | "dark" | "system";
export type ThemeLane = "paper" | "dark";

export type ThemeTokens = {
  bg: string;
  ink: string;
  accent: string;
  card: string;
  ink2: string;
};

export const PAPER_TOKENS: ThemeTokens = {
  bg: "#f7f7f4",
  ink: "#26251e",
  accent: "#f54e00",
  card: "#f7f7f4",
  ink2: "#6b6a63",
};

export const DARK_TOKENS: ThemeTokens = {
  bg: "#14120b",
  ink: "#edecec",
  accent: "#f54e00",
  card: "#1b1913",
  ink2: "#a8a7a2",
};

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
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "paper";
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
    return "paper";
  }
  return document.documentElement.dataset.theme === "dark" ? "dark" : "paper";
}

/** Live lane tokens for canvas paint. Prefer computed CSS; fall back to the lane constants. */
export function readThemeTokens(): ThemeTokens {
  const fallback = themeLane() === "dark" ? DARK_TOKENS : PAPER_TOKENS;
  return {
    bg: readCss("--bg", fallback.bg),
    ink: readCss("--ink", fallback.ink),
    accent: readCss("--accent", fallback.accent),
    card: readCss("--card", fallback.card),
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
