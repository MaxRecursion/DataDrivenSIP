/**
 * Puts one fund's artifact together (PLAN.md §4, §5). Pure: no I/O, no clock, no randomness.
 */
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { isoFromDay, type DayNum } from "./dates";
import type { NavHistory } from "./nav";
import { rollingStats } from "./rolling";
import { simulateAll, SIP_DATES } from "./simulate";
import { splitHalfStability } from "./stability";
import { confidenceOf, verdictOf } from "./verdict";

export type FundMeta = { code: number; name: string; house: string; category: string };

/** Thrown when a fund can't be analysed at all, so the pipeline can quarantine it and log why. */
export class AnalysisError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

/** Rounds half away from zero, so a negative stability rounds like its positive mirror. */
const round3 = (value: number) => (Math.sign(value) * Math.round(Math.abs(value) * 1000)) / 1000;
const argmax = (values: readonly number[]) =>
  values.reduce((best, value, index) => (value > (values[best] ?? -Infinity) ? index : best), 0);

export type AnalyseOptions = {
  /** The day the published history was cut at, when it doesn't start at the fund's first NAV. */
  trimmedFrom?: DayNum;
};

export function analyse(history: NavHistory, meta: FundMeta, options: AnalyseOptions = {}): FundArtifact {
  const perDate = simulateAll(history, "per-date");
  const common = simulateAll(history, "common");

  // Without a month every date could invest in, the rupee comparisons have nothing to stand
  // on: corpus, spreadRupees and metricsAgree would all be zero or meaningless.
  if ((common[0]?.instalments ?? 0) === 0) {
    throw new AnalysisError("no-common-months", "No month has a NAV within seven days of all 28 dates");
  }

  const percentRates = perDate.map((simulation) => {
    if (simulation.xirr === null) {
      throw new AnalysisError("xirr-unsolved", `No XIRR in [-99%, 300%] for date ${simulation.d}`);
    }
    return simulation.xirr * 100;
  });
  const corpuses = common.map((simulation) => simulation.corpus);

  const rolling = rollingStats(history);
  const { stability, instalments: halfInstalments } = splitHalfStability(history);

  const spreadPp = round3(Math.max(...percentRates) - Math.min(...percentRates));
  const roundedStability = stability === null ? null : round3(stability);

  const dates: DateResult[] = SIP_DATES.map((d, index) => {
    const meanPct = rolling.meanPct[index];
    const topQ = rolling.topQ[index];
    return {
      d,
      xirr: round3(percentRates[index] ?? 0),
      corpus: Math.round(corpuses[index] ?? 0),
      meanPct: meanPct === null || meanPct === undefined ? null : round3(meanPct),
      topQ: topQ === null || topQ === undefined ? null : round3(topQ),
      w: round3(rolling.wins[index] ?? 0),
    };
  });

  return {
    code: meta.code,
    name: meta.name,
    house: meta.house,
    category: meta.category,
    navFrom: isoFromDay(history.first),
    navTo: isoFromDay(history.last),
    // Every date pays the same number of instalments on the common month set.
    instalments: common[0]?.instalments ?? 0,
    dates,
    spreadPp,
    spreadRupees: Math.round(Math.max(...corpuses) - Math.min(...corpuses)),
    stability: roundedStability,
    // Compare the values the artifact actually publishes: deciding this on unrounded rates
    // makes the flag contradict the numbers a reader can see.
    metricsAgree: argmax(dates.map((date) => date.xirr)) === argmax(dates.map((date) => date.corpus)),
    verdict: verdictOf(spreadPp, roundedStability),
    windows: rolling.windows,
    // Pooled across every date and month of the common set, so the range doesn't depend on
    // which date the reader's salary happens to allow.
    instalmentLow: Math.round(Math.min(...common.map((simulation) => simulation.lowestInstalmentValue))),
    instalmentHigh: Math.round(Math.max(...common.map((simulation) => simulation.highestInstalmentValue))),
    // Filled in once every fund has been analysed: a typical spread is a fact about the whole
    // data set, not about one fund, so it cannot be known here (cohort.ts).
    cohortSpreadPp: null,
    // A cut history is never full confidence: part of the fund's life is missing.
    confidence: options.trimmedFrom === undefined ? confidenceOf(rolling.windows, halfInstalments) : "reduced",
    ...(options.trimmedFrom === undefined ? {} : { trimmedFrom: isoFromDay(options.trimmedFrom) }),
  };
}
