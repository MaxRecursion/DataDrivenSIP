/**
 * The numbers behind the small "at a glance" icons next to the calendar and the disclosure
 * triggers — a miniature of this fund's own 28-date curve, so a reader can see its shape
 * without opening "The full curve" and reading the caption.
 *
 * Pure: no I/O, no clock, no randomness. Rendering (the actual SVG) lives in
 * `components/glance-icons.tsx`; this file only turns real XIRR figures into plot positions.
 */

/**
 * Each value's vertical position on a 0-to-1 scale, 0 at the top (the highest XIRR) and 1 at
 * the bottom — SVG y grows downward, so this is the flip an honest chart needs. A flat series
 * (every date identical) centres at 0.5 rather than dividing by zero, which would otherwise
 * turn "nothing to show" into a crash or a line pinned to one edge.
 */
export function curvePoints(xirrs: readonly number[]): number[] {
  if (xirrs.length === 0) return [];
  const low = Math.min(...xirrs);
  const range = Math.max(...xirrs) - low;
  if (range === 0) return xirrs.map(() => 0.5);
  return xirrs.map((xirr) => 1 - (xirr - low) / range);
}
