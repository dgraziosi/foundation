/** Home graph fills leftover viewport under the view strip. Widgets sit below. */
export const GRAPH_FLOOR_PX = 460;

/**
 * Height is leftover (100% of the Home scrollport), never below 460px.
 * shrink-0 so Recents / open-tasks / folders cannot steal that band.
 */
export const HOME_GRAPH_FRAME_CLASS =
  "h-[max(460px,100%)] min-h-[460px] w-full shrink-0";

/** Empty or loading graphs must not capture wheel/pan; the page scroller owns those. */
export function graphPassesPageScroll(input: { loading?: boolean; nodeCount: number }): boolean {
  return Boolean(input.loading) || input.nodeCount === 0;
}

/** Ignore collapsed ResizeObserver frames so the force canvas survives a shrink. */
export function readGraphFrameSize(box: { clientWidth: number; clientHeight: number }): {
  width: number;
  height: number;
} | undefined {
  const width = box.clientWidth;
  const height = box.clientHeight;
  if (width < 2 || height < 2) {
    return undefined;
  }
  return { width, height };
}
