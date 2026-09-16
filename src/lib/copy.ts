/**
 * The sentences that sit around the answer (PLAN.md D7, D1, D21).
 *
 * This is where the product is honest or isn't. Every line here is bounded by what the
 * artifact actually measured: the headline never claims more than the verdict supports, the
 * caveats say out loud when a number is likely to be an artifact of a short history, and the
 * rupee line names the dates it is comparing rather than leaving "the spread" abstract.
 *
 * Pure and total. It reads the artifact and the pick, and returns strings; it never formats a
 * number itself (format.ts does that) and never throws, because a thrown copy function would
 * take the whole page down over a rounding case.
 */
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import type { Answer } from "./answer";
import {
  formatLakh,
  formatNavDate,
  formatPercentOfValue,
  formatPp,
  formatRupees,
  formatYears,
  ordinal,
} from "./format";

export type AnswerCopy = {
  headline: string;
  caveats: string[];
  rupeeLine: string;
  srSummary: string;
};

/**
 * Mirrors SPREAD_THRESHOLD_PP and STABILITY_THRESHOLD in pipeline/analysis/verdict.ts. The app
 * never imports pipeline code, so the two copies are kept honest by a test that recomputes the
 * verdict of real published funds from these values. The thresholds are frozen: moving them
 * needs explicit approval (CLAUDE.md), and copy.ts is not where that would happen.
 */
export const SPREAD_THRESHOLD_PP = 0.25;
export const STABILITY_THRESHOLD = 0.6;

/**
 * Under this, the answer's lead over the rest of the window is smaller than the resolution the
 * page prints, so every verdict falls back to the tiebreak line (D7). Claiming an edge the
 * reader can't see rounded to two decimals is exactly the overclaiming D7 exists to stop.
 */
export const MIN_EDGE_PP = 0.005;

/**
 * Eight years of monthly instalments. Below this the spread is largely a function of how much
 * history there is rather than of the fund (D21), and the copy says so.
 */
export const SETTLED_INSTALMENTS = 96;

/** The SIP the rupee figures are simulated on. Notional, and the copy says that too (D1). */
const NOTIONAL_MONTHLY = 10_000;

/**
 * The dates with the highest and lowest final value. These are the rupee extremes, not the
 * XIRR extremes: for Kotak they are the 1st and the 20th, where the XIRR extremes are the 26th
 * and the 9th (D1). A tie keeps the earlier date, since `dates` runs 1 to 28.
 *
 * Every artifact carries 28 dates; the fallback to the answer's own row only keeps this total.
 */
function corpusExtremes(fund: FundArtifact, answer: Answer): { highest: DateResult; lowest: DateResult } {
  let highest = fund.dates[0] ?? answer.result;
  let lowest = highest;
  for (const date of fund.dates) {
    if (date.corpus > highest.corpus) highest = date;
    if (date.corpus < lowest.corpus) lowest = date;
  }
  return { highest, lowest };
}

/**
 * The D7 table, in precedence order. Each row is reached only when every row above it has been
 * ruled out, which is what keeps a short history from ever being described as a date effect.
 */
function headlineFor(fund: FundArtifact, answer: Answer): string {
  const nth = ordinal(answer.date);

  // Too little history to say anything about dates, whatever the verdict computed. A fund whose
  // series was cut is always reduced (D21), so this row also covers a truncated history.
  if (fund.confidence === "reduced") {
    // A cut series is reduced however much of it survives (D21), so the short-history sentence
    // would contradict itself here: 119746 keeps 163 months, which is thirteen years. What is
    // actually reduced is how much of the fund's life the page can speak for.
    if (fund.trimmedFrom !== undefined) {
      return `Part of this fund's history couldn't be used, so this reads on ${fund.instalments} months rather than the fund's whole life. The ${nth} fits your window.`;
    }
    return `This fund has ${fund.instalments} months of history, too little to tell whether the date matters. The ${nth} fits your window.`;
  }

  // A full-confidence fund has at least 24 rolling windows, so "across 3-year stretches" is
  // always describing something that was actually measured.
  const tiebreak = `Any date in your window has done about the same in this fund. The ${nth} is a tiebreak: across 3-year stretches it came out slightly ahead more often.`;
  if (fund.verdict === "noise" || answer.edgePp <= MIN_EDGE_PP) return tiebreak;

  const wideSpread = fund.spreadPp > SPREAD_THRESHOLD_PP;
  // An unknown stability is never read as stable, matching the engine.
  const stable = fund.stability !== null && fund.stability > STABILITY_THRESHOLD;

  if (fund.verdict === "marginal") {
    if (wideSpread && !stable) {
      return `Dates in this fund have differed by up to ${formatPp(fund.spreadPp)}, but not consistently. The ${nth} came out slightly ahead in your window; the pattern may not hold.`;
    }
    if (stable && !wideSpread) {
      return `The ${nth} has come out slightly ahead in your window fairly consistently, but by very little: ${formatPp(answer.edgePp)} of XIRR.`;
    }
    // Marginal means exactly one test passed. An artifact that says otherwise is stale against
    // these constants, and the quietest line is the one to fall back to.
    return tiebreak;
  }

  if (fund.verdict === "meaningful") {
    return `In this fund the ${nth} has come out ahead of the other dates in your window: +${formatPp(answer.edgePp)} of XIRR over ${formatYears(fund.navFrom, fund.navTo)}.`;
  }

  return tiebreak;
}

/** The lines under the headline, each one only when it applies. */
function caveatsFor(fund: FundArtifact): string[] {
  const caveats: string[] = [];

  // Two metrics disagreeing is itself evidence of noise. A noise verdict has already said that,
  // so the line would only repeat it.
  if (!fund.metricsAgree && fund.verdict !== "noise") {
    caveats.push(
      "The date with the highest XIRR and the date with the highest final value differ here, which points to noise.",
    );
  }

  // D21. The thresholds are absolute, but the spread they judge shrinks as history grows, so a
  // short fund clears them on sampling noise alone. The number stays; the copy says what it is.
  //
  // Except where the headline already led with the month count: a reduced fund would otherwise
  // open "This fund has 40 months of history, too little to tell whether the date matters" and
  // follow it with "This fund has 40 months of history, fewer than eight years" — the same fact
  // twice, which reads as padding and teaches the reader to skip the second sentence. A trimmed
  // fund's headline claims nothing about length, so it still needs this.
  const headlineGaveLength = fund.confidence === "reduced" && fund.trimmedFrom === undefined;
  if (fund.verdict !== "noise" && fund.instalments < SETTLED_INSTALMENTS && !headlineGaveLength) {
    caveats.push(
      `This fund has ${fund.instalments} months of history, fewer than eight years. A spread of ${formatPp(fund.spreadPp)} is about what a history that short produces on its own, so this verdict reflects the length of the history as much as the fund.`,
    );
  }

  // The page must never present a truncated series as the fund's whole life (CLAUDE.md).
  if (fund.trimmedFrom !== undefined) {
    caveats.push(
      `The published history starts on ${formatNavDate(fund.trimmedFrom)}, where a re-denomination or a gap months long cut the series. Everything before that is missing, so this is not the fund's whole life.`,
    );
  }

  return caveats;
}

/**
 * The rupee framing (D1). It names the two dates being compared, states that the SIP is
 * notional, and divides the gap by the highest corpus so "% of final value" has a base.
 */
function rupeeLineFor(fund: FundArtifact, answer: Answer): string {
  const { highest, lowest } = corpusExtremes(fund, answer);
  const shareOfValue = highest.corpus > 0 ? fund.spreadRupees / highest.corpus : 0;
  const invested = fund.instalments * NOTIONAL_MONTHLY;
  return `For a notional ${formatRupees(NOTIONAL_MONTHLY)} monthly SIP, the highest- and lowest-value dates (the ${ordinal(highest.d)} and ${ordinal(lowest.d)}) ended ${formatRupees(fund.spreadRupees)} apart on ${formatLakh(invested)} invested, ${formatPercentOfValue(shareOfValue)} of final value, over ${formatYears(fund.navFrom, fund.navTo)}.`;
}

/**
 * What a screen reader gets in place of the grid (PLAN.md 6.6). The window can wrap past the
 * 28th, so these are its first and last dates in window order, not its smallest and largest.
 */
function srSummaryFor(answer: Answer, window: number[]): string {
  const first = window[0] ?? answer.date;
  const last = window[window.length - 1] ?? answer.date;
  return `Your window: ${ordinal(first)} to ${ordinal(last)}. Your date: the ${ordinal(answer.date)}.`;
}

export function answerCopy(fund: FundArtifact, answer: Answer, window: number[]): AnswerCopy {
  return {
    headline: headlineFor(fund, answer),
    caveats: caveatsFor(fund),
    rupeeLine: rupeeLineFor(fund, answer),
    srSummary: srSummaryFor(answer, window),
  };
}
