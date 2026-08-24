import { useEffect, useState } from "react";

/** VIEWER.md wide stop. */
export const WIDE_MIN_PX = 1280;

export function isWideLane(width: number): boolean {
  return width >= WIDE_MIN_PX;
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
