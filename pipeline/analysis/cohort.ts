/**
 * What a spread of a given size means for a fund with a given amount of history (PLAN.md D21).
 *
 * The verdict thresholds are absolute and frozen, but the quantity they judge is not: the
 * max-minus-min of 28 estimates shrinks as history grows, so the same 0.77 pp means something
 * very different at 40 months and at 200. D21 asks for that comparison to be *shown* rather than
 * asserted, which needs a number no single fund can know — the typical spread among funds of
 * similar length. It is computed once across the whole published set and stamped onto each fund.
 *
 * Pure, like everything else in this directory: no I/O, no clock, no randomness. It never reads
 * or writes a verdict, and nothing here can change one.
 */
import type { FundArtifact } from "../../shared/artifacts";

/** Eligibility starts at 37 instalments, so that is where the first band starts. */
export const COHORT_FLOOR = 37;

/** A year of instalments per band: fine enough to separate a 40-month fund from an 80-month one. */
export const COHORT_BAND = 12;

/**
 * Below this many funds a band has no meaningful "typical", and publishing one would invite a
 * reader to compare their fund against two others. Such funds carry null and the page says less.
 */
export const MIN_COHORT = 10;

/** Which band a fund falls in. Everything below the floor shares the first band. */
export function cohortOf(instalments: number): number {
  return Math.max(0, Math.floor((instalments - COHORT_FLOOR) / COHORT_BAND));
}

/** Rounds half away from zero, matching analyse.ts so the published figures agree. */
const round3 = (value: number) => (Math.sign(value) * Math.round(Math.abs(value) * 1000)) / 1000;

function median(sorted: readonly number[]): number {
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

/** The median spread in each band, for bands with enough funds to have one. */
export function cohortSpreads(artifacts: readonly FundArtifact[]): Map<number, number> {
  const bands = new Map<number, number[]>();
  for (const artifact of artifacts) {
    const band = cohortOf(artifact.instalments);
    const spreads = bands.get(band);
    if (spreads) spreads.push(artifact.spreadPp);
    else bands.set(band, [artifact.spreadPp]);
  }

  const medians = new Map<number, number>();
  for (const [band, spreads] of bands) {
    if (spreads.length < MIN_COHORT) continue;
    medians.set(band, round3(median([...spreads].sort((a, b) => a - b))));
  }
  return medians;
}

/** The same artifacts, each carrying the typical spread for its own band. Never mutates. */
export function withCohortSpread(artifacts: readonly FundArtifact[]): FundArtifact[] {
  const medians = cohortSpreads(artifacts);
  return artifacts.map((artifact) => ({
    ...artifact,
    cohortSpreadPp: medians.get(cohortOf(artifact.instalments)) ?? null,
  }));
}
