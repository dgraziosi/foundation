import { useEffect, useState } from "react";

/** VIEWER.md wide stop. Sheet is medium and narrow only. */
export const WIDE_MIN_PX = 1280;

export function isWideLane(width: number): boolean {
  return width >= WIDE_MIN_PX;
}

/** Docked inspector is the only inspector on wide. No portal, overlay, or focus trap. */
export function inspectorSheetOpen(open: boolean, wide: boolean): boolean {
  return open && !wide;
}

export function useWideLane(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(`(min-width: ${WIDE_MIN_PX}px)`).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${WIDE_MIN_PX}px)`);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return wide;
}
