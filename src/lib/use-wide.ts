/**
 * Whether the page is on a large desktop screen, where the fund page becomes a four-column
 * dashboard with every section open, so the whole answer fits one screen without scrolling.
 *
 * The columns themselves are CSS (Tailwind's `2xl:`, 96rem = 1536px, which this query must
 * match), so they are right from the first paint of the prerendered HTML. Only opening the
 * sections needs this, and it can only be known after mount: false on the server and on the
 * first client render, so hydration matches.
 */
import { useEffect, useState } from "react";

export const WIDE_QUERY = "(min-width: 96rem)";

export function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * How much the root font size has been scaled up for a large screen, relative to 16px — the
 * rule in styles/index.css. Everything sized in rem follows it for free; this is for the few
 * things sized in pixels (chart heights, a canvas font), so they grow in step. 1 on the server,
 * on the first client render, and below the wide breakpoint.
 */
export function useRootScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () =>
      setScale(parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}
