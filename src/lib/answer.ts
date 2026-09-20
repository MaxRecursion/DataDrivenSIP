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

/** XIRR is published at 3 dp, so whole thousandths of a percentage point are exact integers. */
const thousandths = (xirr: number): number => Math.round(xirr * 1000);

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

/**
 * The edge over the middle of the window, computed in exact integers.
 *
 * Every XIRR is a whole number of thousandths, and the median of ten of them is the mean of two,
 * so every edge this can produce is a multiple of 0.0005 — precisely the values that sit on a
 * float round's own tie point. Rounding one put 45.6% of all window states there, leaving binary
 * representation error to decide which D7 headline a fund got at the 0.005 threshold: two funds
 * with an identical measured edge of 0.0055 pp were given different sentences. Integers decide
 * it by the number instead. The division happens once, at the end, so callers still get points.
 */
function doubledMedian(pool: Candidate[]): number {
  const sorted = pool.map(({ result }) => thousandths(result.xirr)).sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? 0;
  const lower = sorted.length % 2 === 0 ? (sorted[middle - 1] ?? upper) : upper;
  // Doubled, so an even-length median needs no halving and the whole sum stays an integer.
  return lower + upper;
}

const edgeFrom = (xirr: number, middle: number): number => (thousandths(xirr) * 2 - middle) / 2000;

function edgeOverWindow(chosen: Candidate, pool: Candidate[]): number {
  return edgeFrom(chosen.result.xirr, doubledMedian(pool));
}

/**
 * Every window date's edge, for the grid to print beside its number.
 *
 * It shares `doubledMedian` and `edgeFrom` with the pick, so the answer's cell and the sentence
 * under it are the same number by construction rather than by two calculations agreeing. Dates
 * outside the window are absent: they are not choices the reader has, so the grid says nothing
 * about them.
 */
/**
 * Every date's distance from the middle of the window, not only the window's own ten.
 *
 * The grid shades all 28 cells, and shading them against a different centre from the one the
 * printed figures use would let a cell read green while the number inside it read minus. One
 * baseline, one story — and for a date the salary rules out, "against the middle of the window
 * you do have" is still the comparison that means something.
 */
export function deviationsFromWindow(fund: FundArtifact, window: number[]): Map<number, number> {
  const pool = candidates(fund, window);
  if (pool.length === 0) return new Map();
  const middle = doubledMedian(pool);
  return new Map(fund.dates.map((result) => [result.d, edgeFrom(result.xirr, middle)]));
}

export function windowEdges(fund: FundArtifact, window: number[]): Map<number, number> {
  const pool = candidates(fund, window);
  if (pool.length === 0) return new Map();
  const middle = doubledMedian(pool);
  return new Map(pool.map(({ result }) => [result.d, edgeFrom(result.xirr, middle)]));
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
    edgePp: edgeOverWindow(chosen, pool),
  };
}
