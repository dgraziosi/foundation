import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyTheme,
  normalizeThemeChoice,
  subscribeTheme,
  themeLane,
  type ThemeChoice,
  type ThemeLane,
} from "./theme-core";

export type { ThemeChoice, ThemeLane, ThemeTokens } from "./theme-core";
export {
  applyTheme,
  DARK_TOKENS,
  LIGHT_TOKENS,
  normalizeThemeChoice,
  PAPER_TOKENS,
  readThemeTokens,
  subscribeGraphPaint,
  subscribeTheme,
} from "./theme-core";

const KEY = "foundation-theme";

const ThemeContext = createContext<{
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}>({ choice: "dark", setChoice: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("dark");

  useEffect(() => {
    const stored = normalizeThemeChoice(window.localStorage.getItem(KEY));
    if (stored) {
      applyTheme(stored);
      setChoiceState(stored);
      return;
    }
    applyTheme("dark");
  }, []);

  useEffect(() => {
    applyTheme(choice);
    if (choice === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => applyTheme("system");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    return undefined;
  }, [choice]);

  const value = useMemo(
    () => ({
      choice,
      setChoice: (next: ThemeChoice) => {
        window.localStorage.setItem(KEY, next);
        applyTheme(next);
        setChoiceState(next);
      },
    }),
    [choice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeLane(): ThemeLane {
  const [lane, setLane] = useState<ThemeLane>(() => themeLane());
  useEffect(() => subscribeTheme(() => setLane(themeLane())), []);
  return lane;
}
