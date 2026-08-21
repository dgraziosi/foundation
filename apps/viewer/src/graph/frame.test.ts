import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  GRAPH_FLOOR_PX,
  HOME_GRAPH_FRAME_CLASS,
  graphPassesPageScroll,
  readGraphFrameSize,
} from "./frame.js";

const root = dirname(fileURLToPath(import.meta.url));

test("collection graph keeps a 460px floor; Home does not host the graph", async () => {
  assert.equal(GRAPH_FLOOR_PX, 460);
  assert.equal(HOME_GRAPH_FRAME_CLASS, "h-[max(460px,100%)] min-h-[460px] w-full shrink-0");
  assert.match(HOME_GRAPH_FRAME_CLASS, /max\(460px,100%\)/);
  assert.match(HOME_GRAPH_FRAME_CLASS, /min-h-\[460px\]/);
  assert.match(HOME_GRAPH_FRAME_CLASS, /shrink-0/);

  const home = await readFile(join(root, "../pages/HomePage.tsx"), "utf8");
  assert.doesNotMatch(home, /HOME_GRAPH_FRAME_CLASS/);
  assert.doesNotMatch(home, /GraphCanvas/);
  assert.doesNotMatch(home, /fetchGraph/);
  assert.match(home, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(home, /100dvh-3rem/);
  assert.doesNotMatch(home, /ScrollArea/);

  const canvas = await readFile(join(root, "GraphCanvas.tsx"), "utf8");
  assert.match(canvas, /min-h-\[460px\]/);
  assert.match(canvas, /shrink-0/);
  assert.doesNotMatch(canvas, /flex-1/);
  assert.match(canvas, /readGraphFrameSize/);
  assert.match(canvas, /stopPropagation/);
  assert.match(canvas, /globalScale/);
  assert.match(canvas, /graphPassesPageScroll/);
  assert.match(canvas, /enableZoomInteraction=\{!passPageScroll\}/);
  assert.match(canvas, /enablePanInteraction=\{!passPageScroll\}/);
  assert.match(canvas, /passPageScroll \? "pointer-events-none"/);

  const shell = await readFile(join(root, "../shell/Shell.tsx"), "utf8");
  assert.match(shell, /h-dvh/);
  assert.match(shell, /overflow-hidden/);
});

test("empty or loading graphs pass wheel and pan to the page scroller", () => {
  assert.equal(graphPassesPageScroll({ loading: true, nodeCount: 0 }), true);
  assert.equal(graphPassesPageScroll({ loading: true, nodeCount: 3 }), true);
  assert.equal(graphPassesPageScroll({ loading: false, nodeCount: 0 }), true);
  assert.equal(graphPassesPageScroll({ loading: false, nodeCount: 3 }), false);
});

test("force canvas ignores collapsed resize frames", () => {
  assert.equal(readGraphFrameSize({ clientWidth: 0, clientHeight: 500 }), undefined);
  assert.equal(readGraphFrameSize({ clientWidth: 900, clientHeight: 0 }), undefined);
  assert.equal(readGraphFrameSize({ clientWidth: 1, clientHeight: 1 }), undefined);
  assert.deepEqual(readGraphFrameSize({ clientWidth: 900, clientHeight: 460 }), {
    width: 900,
    height: 460,
  });
});
