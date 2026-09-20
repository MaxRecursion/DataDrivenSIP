/**
 * The pick: which one of a fund's 28 SIP dates does the page name?
 *
 * The date with the greatest full-history XIRR, and on a tie the earliest one. That is the whole
 * rule. `meanPct`, `topQ` and `w` — how a date ranked across rolling 3-year windows — are still
 * published in the artifact and still discussed in the disclosures, but they do not choose the
 * date any more, and neither does a salary window.
 *
 * Pure, like the pipeline's analysis code: no I/O, no clock, no randomness.
 */
import type { DateResult, FundArtifact } from "../../shared/artifacts";

export type Answer = {
  /** The SIP date to run, 1-28. */
  date: number;
  /** That date's row from the artifact, so callers never search `fund.dates` again. */
  result: DateResult;
  /** This date's XIRR minus the median XIRR of all 28 SIP dates, in percentage points. */
  edgePp: number;
};

/** XIRR is published at 3 dp, so whole thousandths of a percentage point are exact integers. */
const thousandths = (xirr: number): number => Math.round(xirr * 1000);

/**
 * The median of all 28 dates, doubled, computed in exact integers.
 *
 * Every XIRR is a whole number of thousandths and the median of an even count is the mean of
 * two, so every edge this can produce is a multiple of 0.0005 — precisely the values that sit on
 * a float round's own tie point. Doubling keeps the whole sum an integer and the division
 * happens once, at the end, so callers still get percentage points.
 */
function doubledMedian(rows: readonly DateResult[]): number {
  const sorted = rows.map((row) => thousandths(row.xirr)).sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? 0;
  const lower = sorted.length % 2 === 0 ? (sorted[middle - 1] ?? upper) : upper;
  return lower + upper;
}

/**
 * The one date the page answers with, plus its distance from the middle of the month.
 *
 * Throws on a fund carrying no dates at all: there is nothing to name, and every published
 * artifact carries 28, which the pipeline validates before writing and the prerender exercises
 * for all 994 funds at build time.
 */
export function pickAnswer(fund: FundArtifact): Answer {
  const rows = fund.dates;
  if (rows.length === 0) throw new Error(`Fund ${fund.code} carries no dates`);

  // Reduce rather than sort: only the leading row is needed. `>` rather than `>=` keeps the
  // earliest date on a tie, since `dates` runs 1 to 28 — and the explicit `d` comparison keeps
  // that true even if a future artifact ever arrives unsorted.
  const chosen = rows.reduce((leader, next) => {
    if (next.xirr > leader.xirr) return next;
    if (next.xirr === leader.xirr && next.d < leader.d) return next;
    return leader;
  });

  return {
    date: chosen.d,
    result: chosen,
    edgePp: (thousandths(chosen.xirr) * 2 - doubledMedian(rows)) / 2000,
  };
}
