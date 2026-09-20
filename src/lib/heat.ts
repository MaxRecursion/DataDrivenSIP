/**
 * Shading the calendar by how each date did.
 *
 * One ramp: the strongest date of the month is the deepest green and the weakest is the palest,
 * scaled across this fund's own range so the whole ramp is used however small that range is.
 *
 * Relative, and only honest because of what sits next to it. A fund whose 28 dates span four
 * hundredths of a percentage point still fills the ramp end to end, so the caption states the
 * real distance — and every cell now prints its own XIRR, which is what keeps a pale green from
 * reading as "poor" when it is in fact 16.90% against a best of 16.94%. It is also what lets the
 * scale stay green for the five published funds that lost money on every date: the colour says
 * "strongest here", and the number underneath says what "here" was worth.
 *
 * Pure: no I/O, no clock, no randomness.
 */

export type Heat = {
  /** How deep to paint, 0 to 1, against the strongest date in the same fund. */
  intensity: number;
};

/**
 * The palest a date is painted. Not zero: a cell washed out to nothing reads as missing data
 * rather than as the bottom of a range, and every one of these dates is a date you could use.
 */
export const MIN_INTENSITY = 0.12;

/** Each date's shading, from each date's XIRR. Dates absent from the input are absent here. */
export function heatForMonth(xirrByDate: ReadonlyMap<number, number>): Map<number, Heat> {
  const values = [...xirrByDate.values()];
  if (values.length === 0) return new Map();

  const low = Math.min(...values);
  const range = Math.max(...values) - low;

  return new Map(
    [...xirrByDate].map(([date, xirr]) => [
      date,
      {
        // Every date identical: none of them stands out, so none is painted as though it did.
        intensity: range === 0 ? MIN_INTENSITY : MIN_INTENSITY + ((xirr - low) / range) * (1 - MIN_INTENSITY),
      },
    ]),
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
