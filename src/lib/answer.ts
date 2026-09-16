/**
 * The pick (PLAN.md §6.4): given a fund and the ten dates the user's window allows, which one
 * date does the page name, and how far ahead of that window does it sit?
 *
 * Pure, like the pipeline's analysis code: no I/O, no clock, no randomness. Candidates are the
 * window's dates and nothing else, so the answer can never be a date the user's salary hasn't
 * arrived for yet — a CLAUDE.md non-negotiable.
 *
 * The ordering is a percentile question, not a returns question: `meanPct` and `topQ` say how a
 * date ranked against the other 27 across rolling 3-year windows, which is stable in a way a
 * single all-history XIRR isn't; XIRR only breaks ties between dates that ranked the same.
 */
import type { DateResult, FundArtifact } from "../../shared/artifacts";

export type Answer = {
  /** The SIP date to run, 1-28. Always one of the window's dates. */
  date: number;
  /** That date's row from the artifact, so callers never search `fund.dates` again. */
  result: DateResult;
  /** This date's XIRR minus the median XIRR of the window, in percentage points. */
  edgePp: number;
};

/** A window date paired with its position in the window, which is the last tie-break. */
type Candidate = { order: number; result: DateResult };

/**
 * XIRR is stored to 3 dp, so a difference between two of them carries no information past 3 dp;
 * the rest is float noise (20.319 - 20.288 lands at 0.031000000000000583). Rounding here keeps
 * the D7 copy thresholds, which compare `edgePp` against 0.005, reading the same number the page
 * prints.
 */
function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  // Negative zero would reach formatPp as a minus sign in front of nothing.
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Descending: positive when `b` should come first. */
const desc = (a: number, b: number): number => b - a;

function byXirr(a: Candidate, b: Candidate): number {
  return desc(a.result.xirr, b.result.xirr) || a.order - b.order;
}

function byPercentile(a: Candidate, b: Candidate): number {
  // The `?? 0` fallbacks are unreachable: percentile ordering is only chosen when every
  // candidate has both metrics. They are here so the comparator can't compare null to a number.
  return (
    desc(a.result.meanPct ?? 0, b.result.meanPct ?? 0) ||
    desc(a.result.topQ ?? 0, b.result.topQ ?? 0) ||
    byXirr(a, b)
  );
}

/**
 * A fund with fewer than three years of history has no rolling windows, so the pipeline writes
 * null percentiles and `windows: 0`, and XIRR is all that's left to order by. A null percentile
 * on a fund that does have windows shouldn't happen; if it ever did, ranking the whole window on
 * XIRR is honest, whereas reading null as a zero score would silently bury that date.
 */
function hasPercentiles(fund: FundArtifact, pool: Candidate[]): boolean {
  return (
    fund.windows > 0 && pool.every(({ result }) => result.meanPct !== null && result.topQ !== null)
  );
}

function candidates(fund: FundArtifact, window: number[]): Candidate[] {
  const byDate = new Map(fund.dates.map((result) => [result.d, result]));
  const pool: Candidate[] = [];
  window.forEach((date, order) => {
    const result = byDate.get(date);
    // A window date the artifact doesn't carry is dropped, never substituted with a neighbour.
    if (result) pool.push({ order, result });
  });
  return pool;
}

/** The middle of the window's XIRRs; with ten dates, the mean of the 5th and 6th. */
function medianXirr(pool: Candidate[]): number {
  const sorted = pool.map(({ result }) => result.xirr).sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? 0;
  const lower = sorted.length % 2 === 0 ? (sorted[middle - 1] ?? upper) : upper;
  return (lower + upper) / 2;
}

/**
 * The one date the page answers with, plus its distance from the middle of the window.
 *
 * Throws when the window and the artifact share no date at all: there is no date left to name
 * that would still be inside the window, and answering with one from outside it is forbidden.
 */
export function pickAnswer(fund: FundArtifact, window: number[]): Answer {
  const pool = candidates(fund, window);
  if (pool.length === 0) {
    throw new Error(`Fund ${fund.code} has no dates in the window [${window.join(", ")}]`);
  }

  const compare = hasPercentiles(fund, pool) ? byPercentile : byXirr;
  // Reduce rather than sort: the comparator is total, so the leading row is the only one we
  // need, and the pool is never empty by the guard above.
  const chosen = pool.reduce((leader, next) => (compare(leader, next) <= 0 ? leader : next));

  return {
    date: chosen.result.d,
    result: chosen.result,
    edgePp: round3(chosen.result.xirr - medianXirr(pool)),
  };
}
