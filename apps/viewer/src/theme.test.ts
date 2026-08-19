import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";
import { test } from "node:test";
import {
  applyTheme,
  DARK_TOKENS,
  PAPER_TOKENS,
  readThemeTokens,
  subscribeGraphPaint,
  subscribeTheme,
  type ThemeChoice,
} from "./theme-core";
import { ThemeProvider, useTheme } from "./theme";

function installThemeDom(stored?: ThemeChoice): Map<string, string> {
  const store = new Map<string, string>();
  if (stored) {
    store.set("foundation-theme", stored);
  }
  const lanes: Record<string, Record<string, string>> = {
    paper: {
      "--bg": PAPER_TOKENS.bg,
      "--ink": PAPER_TOKENS.ink,
      "--accent": PAPER_TOKENS.accent,
      "--card": PAPER_TOKENS.card,
      "--ink-2": PAPER_TOKENS.ink2,
    },
    dark: {
      "--bg": DARK_TOKENS.bg,
      "--ink": DARK_TOKENS.ink,
      "--accent": DARK_TOKENS.accent,
      "--card": DARK_TOKENS.card,
      "--ink-2": DARK_TOKENS.ink2,
    },
  };
  const root = { dataset: { theme: "paper" } };
  Object.assign(globalThis, {
    document: { documentElement: root },
    getComputedStyle: () => ({
      getPropertyValue(name: string) {
        const lane = root.dataset.theme === "dark" ? "dark" : "paper";
        return lanes[lane]?.[name] ?? "";
      },
    }),
    window: {
      matchMedia: (query: string) => ({
        matches: query.includes("dark") ? false : false,
        addEventListener() {},
        removeEventListener() {},
      }),
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    },
  });
  return store;
}

test("graph paint follows the active theme, not only the first render", () => {
  installThemeDom();
  const paints: Array<{ bg: string; ink: string; card: string; accent: string }> = [];
  const stop = subscribeGraphPaint((tokens) => {
    paints.push({ bg: tokens.bg, ink: tokens.ink, card: tokens.card, accent: tokens.accent });
  });

  assert.equal(paints.length, 1);
  assert.deepEqual(paints[0], {
    bg: PAPER_TOKENS.bg,
    ink: PAPER_TOKENS.ink,
    card: PAPER_TOKENS.card,
    accent: PAPER_TOKENS.accent,
  });

  applyTheme("dark");
  applyTheme("paper");
  applyTheme("system");

  assert.equal(paints.length, 4);
  assert.deepEqual(paints[1], {
    bg: DARK_TOKENS.bg,
    ink: DARK_TOKENS.ink,
    card: DARK_TOKENS.card,
    accent: DARK_TOKENS.accent,
  });
  assert.deepEqual(paints[2], paints[0]);
  assert.deepEqual(paints[3], paints[0]);
  assert.notEqual(paints[1]?.bg, paints[0]?.bg);
  assert.notEqual(paints[1]?.ink, paints[0]?.ink);
  assert.equal(readThemeTokens().bg, PAPER_TOKENS.bg);
  stop();
});

test("subscribeTheme fires when applyTheme changes the lane", () => {
  installThemeDom();
  let fires = 0;
  const stop = subscribeTheme(() => {
    fires += 1;
  });
  applyTheme("paper");
  applyTheme("dark");
  assert.equal(fires, 2);
  assert.equal(readThemeTokens().bg, DARK_TOKENS.bg);
  assert.equal(readThemeTokens().card, DARK_TOKENS.card);
  stop();
});

test("theme context choice updates after unlock restore and each toggle", () => {
  installThemeDom("dark");
  const seen: ThemeChoice[] = [];
  let setChoice: (next: ThemeChoice) => void = () => undefined;

  function Probe() {
    const theme = useTheme();
    setChoice = theme.setChoice;
    seen.push(theme.choice);
    return null;
  }

  act(() => {
    createRenderer(createElement(ThemeProvider, null, createElement(Probe)));
  });

  assert.equal(seen.at(-1), "dark");

  act(() => {
    setChoice("paper");
  });
  assert.equal(seen.at(-1), "paper");

  act(() => {
    setChoice("system");
  });
  assert.equal(seen.at(-1), "system");

  act(() => {
    setChoice("dark");
  });
  assert.equal(seen.at(-1), "dark");
  assert.ok(seen.includes("paper"));
  assert.ok(seen.includes("system"));
});
