/**
 * Shapes of the static data files. The pipeline writes them and the app reads them (PLAN.md §5).
 * Types only: nothing here runs.
 */

export type Verdict = "noise" | "marginal" | "meaningful";
export type Confidence = "full" | "reduced";

/** Results for one SIP date, 1–28. */
export type DateResult = {
  d: number;
  /** XIRR in percent, 3 dp, from the per-date month rule. */
  xirr: number;
  /** Final value in whole rupees of a notional ₹10,000/month SIP over the common month set. */
  corpus: number;
  /** Mean percentile across rolling 3-year windows, 3 dp. Null when the fund has no windows. */
  meanPct: number | null;
  /** Share of rolling windows in the top quartile, 3 dp. Null when the fund has no windows. */
  topQ: number | null;
  /** Rolling windows this date led, with fractional credit for ties. */
  w: number;
};

/** public/data/funds/{code}.json */
export type FundArtifact = {
  code: number;
  name: string;
  house: string;
  category: string;
  /** YYYY-MM-DD */
  navFrom: string;
  /** YYYY-MM-DD */
  navTo: string;
  instalments: number;
  dates: DateResult[];
  spreadPp: number;
  spreadRupees: number;
  /** Split-half Spearman rank correlation, 3 dp. Null when it can't be computed. */
  stability: number | null;
  metricsAgree: boolean;
  verdict: Verdict;
  windows: number;
  confidence: Confidence;
  /**
   * What a single ₹10,000 instalment is worth at the last NAV: the least and the most, across
   * every date and every month of the common set. "What actually matters" weighs a missed
   * instalment against the whole date spread, and D7 is explicit that an average alone would be
   * read as a guarantee — so the range is published and the mean is derived from `corpus`.
   */
  instalmentLow: number;
  instalmentHigh: number;
  /**
   * The median `spreadPp` among funds with a similar amount of history (see cohort.ts). D21 asks
   * for the comparison to be shown rather than asserted: a 0.77 pp spread means one thing at 40
   * months and another at 200. Null when the band holds too few funds to have a typical value.
   */
  cohortSpreadPp: number | null;
  /**
   * Set when the published history starts later than the fund's own first NAV, because the
   * series before this date belongs to a different one: a re-denomination, or a hole months
   * long. Such a fund is always "reduced" confidence, and the UI must say so.
   */
  trimmedFrom?: string;
};

/**
 * One row of public/data/index.json. Rows are in scheme-code order, never ordered by a metric.
 * The last two fields are labels only — search still ranks by text match (CLAUDE.md).
 */
export type IndexRow = [
  code: number,
  name: string,
  house: string,
  category: string,
  verdict?: Verdict,
  spreadPp?: number,
];

export function indexRowFrom(
  artifact: Pick<FundArtifact, "code" | "name" | "house" | "category" | "verdict" | "spreadPp">,
): IndexRow {
  return [artifact.code, artifact.name, artifact.house, artifact.category, artifact.verdict, artifact.spreadPp];
}

/** One row of public/data/trending.json: a fund and its NAV change over the past month. */
export type TrendingRow = { code: number; name: string; house: string; monthPct: number };

/**
 * public/data/trending.json — the funds whose NAV rose most over the past month, shown when the
 * search box is focused empty. `basis` is shown to the reader, because "trending" here means
 * price momentum, never popularity: nothing in this project counts visits.
 */
export type Trending = { navAsOf: string; basis: string; funds: TrendingRow[] };

/** public/data/meta.json */
export type Meta = {
  builtAt: string;
  fundCount: number;
  /** YYYY-MM-DD: the most common latest-NAV date across included funds. */
  navAsOf: string;
  pipelineVersion: string;
  dataVersion: string;
  source: string;
};
