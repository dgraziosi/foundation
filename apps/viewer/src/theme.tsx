import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyTheme, type ThemeChoice } from "./theme-core";

export type { ThemeChoice, ThemeLane, ThemeTokens } from "./theme-core";
export {
  applyTheme,
  DARK_TOKENS,
  PAPER_TOKENS,
  readThemeTokens,
  subscribeGraphPaint,
  subscribeTheme,
} from "./theme-core";

const KEY = "foundation-theme";

const ThemeContext = createContext<{
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}>({ choice: "paper", setChoice: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("paper");

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "dark" || stored === "system" || stored === "paper") {
      applyTheme(stored);
      setChoiceState(stored);
      return;
    }
    applyTheme("paper");
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
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
