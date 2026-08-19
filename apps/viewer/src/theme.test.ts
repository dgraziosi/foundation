import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create as createRenderer } from "react-test-renderer";
import { test } from "node:test";
import {
  applyTheme,
  DARK_TOKENS,
  LIGHT_TOKENS,
  normalizeThemeChoice,
  readThemeTokens,
  subscribeGraphPaint,
  subscribeTheme,
  type ThemeChoice,
} from "./theme-core";
import { ThemeProvider, useTheme } from "./theme";

function installThemeDom(stored?: string): Map<string, string> {
  const store = new Map<string, string>();
  if (stored) {
    store.set("foundation-theme", stored);
  }
  const lanes: Record<string, Record<string, string>> = {
    light: {
      "--canvas": LIGHT_TOKENS.bg,
      "--ink": LIGHT_TOKENS.ink,
      "--accent": LIGHT_TOKENS.accent,
      "--elevated": LIGHT_TOKENS.card,
      "--ink-2": LIGHT_TOKENS.ink2,
    },
    dark: {
      "--canvas": DARK_TOKENS.bg,
      "--ink": DARK_TOKENS.ink,
      "--accent": DARK_TOKENS.accent,
      "--elevated": DARK_TOKENS.card,
      "--ink-2": DARK_TOKENS.ink2,
    },
  };
  const root = { dataset: { theme: "dark" } };
  Object.assign(globalThis, {
    document: { documentElement: root },
    getComputedStyle: () => ({
      getPropertyValue(name: string) {
        const lane = root.dataset.theme === "light" ? "light" : "dark";
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

test("stored paper choice reads as Light", () => {
  assert.equal(normalizeThemeChoice("paper"), "light");
  assert.equal(normalizeThemeChoice("light"), "light");
  assert.equal(normalizeThemeChoice("dark"), "dark");
  assert.equal(normalizeThemeChoice("system"), "system");
  assert.equal(normalizeThemeChoice("nope"), undefined);
});

test("graph paint follows the active theme, not only the first render", () => {
  installThemeDom();
  const paints: Array<{ bg: string; ink: string; card: string; accent: string }> = [];
  const stop = subscribeGraphPaint((tokens) => {
    paints.push({ bg: tokens.bg, ink: tokens.ink, card: tokens.card, accent: tokens.accent });
  });

  assert.equal(paints.length, 1);
  assert.deepEqual(paints[0], {
    bg: DARK_TOKENS.bg,
    ink: DARK_TOKENS.ink,
    card: DARK_TOKENS.card,
    accent: DARK_TOKENS.accent,
  });

  applyTheme("light");
  applyTheme("dark");
  applyTheme("system");

  assert.equal(paints.length, 4);
  assert.deepEqual(paints[1], {
    bg: LIGHT_TOKENS.bg,
    ink: LIGHT_TOKENS.ink,
    card: LIGHT_TOKENS.card,
    accent: LIGHT_TOKENS.accent,
  });
  assert.deepEqual(paints[2], paints[0]);
  assert.deepEqual(paints[3], paints[1]);
  assert.notEqual(paints[1]?.bg, paints[0]?.bg);
  assert.notEqual(paints[1]?.ink, paints[0]?.ink);
  assert.equal(readThemeTokens().bg, LIGHT_TOKENS.bg);
  stop();
});

test("subscribeTheme fires when applyTheme changes the lane", () => {
  installThemeDom();
  let fires = 0;
  const stop = subscribeTheme(() => {
    fires += 1;
  });
  applyTheme("light");
  applyTheme("dark");
  assert.equal(fires, 2);
  assert.equal(readThemeTokens().bg, DARK_TOKENS.bg);
  assert.equal(readThemeTokens().card, DARK_TOKENS.card);
  stop();
});

test("theme context restores paper as Light and toggles Light / Dark / System", () => {
  installThemeDom("paper");
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

  assert.equal(seen.at(-1), "light");

  act(() => {
    setChoice("dark");
  });
  assert.equal(seen.at(-1), "dark");

  act(() => {
    setChoice("system");
  });
  assert.equal(seen.at(-1), "system");

  act(() => {
    setChoice("light");
  });
  assert.equal(seen.at(-1), "light");
  assert.ok(seen.includes("dark"));
  assert.ok(seen.includes("system"));
});
