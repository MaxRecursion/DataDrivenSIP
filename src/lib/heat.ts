/**
 * Shading the calendar against today's date.
 *
 * The question the page answers is "which day of the month", and the reader already runs their
 * SIP on some day — so the useful comparison is against the one they are standing on. Today's
 * date is the baseline: every other date is painted by how its full-history XIRR compares to
 * the baseline date's, green above and red below.
 *
 * The two sides are scaled separately rather than on one span. A fund whose dates run from
 * −0.01 pp to +0.30 pp around the baseline would, on a shared scale, paint every red date at a
 * thirtieth of the ramp and so paint them all the same. Scaling each side to its own extreme
 * means the deepest red is always the worst date and the deepest green always the best, and
 * neither side's detail is crushed by the other's range.
 *
 * Relative, and only honest because every cell prints its own XIRR beside the colour. A fund
 * whose 28 dates span four hundredths of a percentage point still fills both ramps end to end;
 * the number underneath is what stops a deep red reading as a loss when it is 20.31% against a
 * baseline of 20.34%.
 *
 * Pure: no I/O, no clock, no randomness. The baseline date is passed in.
 */

/** Which way a date sits against the baseline. `level` is the baseline itself, and its ties. */
export type Direction = "up" | "down" | "level";

export type Heat = {
  direction: Direction;
  /** How deep to paint, 0 to 1, against the furthest date on the same side. */
  intensity: number;
};

/**
 * The palest a date that differs from the baseline is painted. Not zero: a cell washed out to
 * nothing reads as missing data rather than as a small difference, and the difference is real.
 */
export const MIN_INTENSITY = 0.12;

/**
 * Each date's shading, from each date's XIRR and the baseline date's.
 *
 * A baseline missing from the input leaves every date level: there is nothing to compare
 * against, and picking a substitute date would silently change what the colours mean.
 */
export function heatForMonth(
  xirrByDate: ReadonlyMap<number, number>,
  baseline: number,
): Map<number, Heat> {
  const level: Heat = { direction: "level", intensity: 0 };
  const baselineXirr = xirrByDate.get(baseline);
  if (baselineXirr === undefined) {
    return new Map([...xirrByDate.keys()].map((date) => [date, level]));
  }

  const deltas = [...xirrByDate].map(([date, xirr]) => [date, xirr - baselineXirr] as const);
  const furthestUp = Math.max(0, ...deltas.map(([, delta]) => delta));
  const furthestDown = Math.max(0, ...deltas.map(([, delta]) => -delta));

  const depth = (distance: number, furthest: number): number =>
    // `furthest` is only 0 when this date is the sole one on its side at distance 0, which is
    // the level case and never reaches here.
    furthest === 0 ? 1 : MIN_INTENSITY + (distance / furthest) * (1 - MIN_INTENSITY);

  return new Map(
    deltas.map(([date, delta]) => {
      if (delta === 0) return [date, level];
      return [
        date,
        delta > 0
          ? { direction: "up" as const, intensity: depth(delta, furthestUp) }
          : { direction: "down" as const, intensity: depth(-delta, furthestDown) },
      ];
    }),
  );
}

/**
 * The distance the shading covers, in percentage points: the weakest date to the strongest. The
 * caller prints it, because a ramp with no stated span invites the reader to supply their own,
 * and theirs will be far too large.
 */
export function heatSpanPp(xirrByDate: ReadonlyMap<number, number>): number {
  const values = [...xirrByDate.values()];
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}
