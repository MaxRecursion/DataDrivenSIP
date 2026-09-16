/**
 * Puts one fund's artifact together (PLAN.md §4, §5). Pure: no I/O, no clock, no randomness.
 */
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { isoFromDay } from "./dates";
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

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const argmax = (values: readonly number[]) =>
  values.reduce((best, value, index) => (value > (values[best] ?? -Infinity) ? index : best), 0);

export function analyse(history: NavHistory, meta: FundMeta): FundArtifact {
  const perDate = simulateAll(history, "per-date");
  const common = simulateAll(history, "common");

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
    metricsAgree: argmax(percentRates) === argmax(corpuses),
    verdict: verdictOf(spreadPp, roundedStability),
    windows: rolling.windows,
    confidence: confidenceOf(rolling.windows, halfInstalments),
  };
}
