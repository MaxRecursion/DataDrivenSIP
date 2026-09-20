/**
 * Shading the calendar by how each date did against the middle of the reader's window.
 *
 * A diverging scale: the weakest date is the deepest red, the strongest the deepest green, and a
 * date sitting on the middle is amber. Intensity is proportional to how far from the middle that
 * date sits, measured against the furthest date in the same fund, so every fund uses the whole
 * ramp and the picture is about THIS fund rather than about how this fund compares to others.
 *
 * Two things are worth stating plainly, because a gradient is a very confident-looking object
 * and the grid is the most persuasive thing on the page.
 *
 * It shades DEVIATIONS, not absolute XIRR. Absolute XIRR never straddles zero inside a fund —
 * 989 of 994 published funds are positive on all 28 dates and the other 5 are negative on all 28
 * — so a red-to-green scale on the raw figure would paint every fund a single flat colour. The
 * deviation is what varies, and it is also the number printed in the cell, so the colour and the
 * label can never tell different stories.
 *
 * Because the scale is relative, a fund whose dates differ by a thousandth of a point still
 * fills the ramp end to end. That is only honest beside a statement of the real distance, which
 * is why `heatSpanPp` exists and why the caller must print it.
 *
 * Pure: no I/O, no clock, no randomness.
 */

/** Red below the middle, green above it. Amber is the absence of both, not a third tone. */
export type Tone = "gain" | "loss";

export type Heat = {
  tone: Tone;
  /** How far from the middle, 0 to 1, against the furthest date in the same fund. */
  intensity: number;
};

/**
 * Each date's shading, from each date's deviation from the middle of the window
 * (`deviationsFromWindow`). Dates absent from the input are absent here too.
 */
export function heatFromDeviations(deviations: ReadonlyMap<number, number>): Map<number, Heat> {
  const furthest = Math.max(0, ...[...deviations.values()].map(Math.abs));

  return new Map(
    [...deviations].map(([date, deviation]) => [
      date,
      {
        // Exactly on the middle counts as a gain, since nothing was given up. It paints amber
        // either way: at zero intensity neither ramp is applied at all.
        tone: deviation < 0 ? "loss" : "gain",
        // Every date identical: no shape to show, so they all sit at the middle rather than all
        // going darkest on the accident of a zero division.
        intensity: furthest === 0 ? 0 : Math.abs(deviation) / furthest,
      },
    ]),
  );
}

/**
 * The distance the shading covers, in percentage points: the weakest date to the strongest. The
 * caller prints it, because a ramp with no stated span invites the reader to supply their own,
 * and theirs will be far too large.
 */
export function heatSpanPp(deviations: ReadonlyMap<number, number>): number {
  const values = [...deviations.values()];
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}
