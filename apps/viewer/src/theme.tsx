import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "paper" | "dark" | "system";

const KEY = "foundation-theme";

function systemTheme(): "paper" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "paper";
}

function applyTheme(choice: ThemeChoice): void {
  const resolved = choice === "system" ? systemTheme() : choice;
  document.documentElement.dataset.theme = resolved;
}

const ThemeContext = createContext<{
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}>({ choice: "paper", setChoice: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("paper");

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "dark" || stored === "system" || stored === "paper") {
      setChoiceState(stored);
      applyTheme(stored);
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
