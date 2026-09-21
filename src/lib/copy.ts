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
  formatYearsOfMonths,
  ordinal,
} from "./format";

export type AnswerCopy = {
  headline: string;
  caveats: string[];
  rupeeLine: string;
  /**
   * The same sentence split around its gap figure, so the reveal can count that figure up
   * (§8.2) without the answer block having to find a number inside a finished string.
   */
  rupeeBefore: string;
  rupeeGap: number;
  rupeeAfter: string;
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
 * Under this, the answer's lead over the middle of the month is smaller than the resolution the
 * page prints, so every verdict falls back to the noise line. Claiming an edge the reader can't
 * see rounded to two decimals is exactly the overclaiming these rows exist to stop.
 */
export const MIN_EDGE_PP = 0.005;

/**
 * Eight years of monthly instalments. Below this the spread is largely a function of how much
 * history there is rather than of the fund (D21), and the copy says so.
 */
export const SETTLED_INSTALMENTS = 96;

/**
 * Mirrors MIN_WINDOWS in pipeline/analysis/verdict.ts. Fewer rolling windows than this and the
 * date question has no answer worth giving, whatever the verdict arithmetic produced.
 *
 * This, rather than `confidence`, is what selects the short-history headline. D7 wrote that row
 * when "reduced" could only mean a short history; D21 then made every trimmed fund reduced
 * however long the surviving series is, which withheld the verdict from eight funds carrying 97
 * to 128 windows. Confidence still drives the caveats and the "How confident is this?" section.
 */
export const MIN_WINDOWS = 24;

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
    // Tie on the date, not on array position: the pipeline's convention is the lowest `d`, and
    // relying on `dates` being sorted would make this quietly wrong the day it isn't.
    if (date.corpus > highest.corpus || (date.corpus === highest.corpus && date.d < highest.d)) highest = date;
    if (date.corpus < lowest.corpus || (date.corpus === lowest.corpus && date.d < lowest.d)) lowest = date;
  }
  return { highest, lowest };
}

/**
 * The headline, in precedence order. Every row states the same fact — which date had the highest
 * full-history XIRR — and then qualifies it by what the fund's history can actually support. A
 * row is reached only when every row above it has been ruled out, which is what keeps a short
 * history from ever being described as a date effect.
 */
function headlineFor(fund: FundArtifact, answer: Answer): string {
  const nth = ordinal(answer.date);
  const fact = `The ${nth} had the highest full-history XIRR for this fund.`;

  // Too little history for the question to have an answer at all. A fund whose series was cut
  // says which of the two things is wrong with it, since "too little history" would contradict
  // itself on a fund that kept thirteen years of it.
  if (fund.windows < MIN_WINDOWS) {
    if (fund.trimmedFrom !== undefined) {
      return `${fact} Part of its history couldn't be used, so that reads on ${fund.instalments} months rather than the fund's whole life.`;
    }
    return `${fact} But ${fund.instalments} months of history is too little to tell whether the date matters at all.`;
  }

  // The dates are so close together that naming one is arithmetic rather than a finding. Saying
  // so is the whole point: the difference is usually about a tenth of a percentage point.
  const noise = `${fact} The 28 dates sit close enough together that the difference between them is noise rather than a date effect.`;
  if (fund.verdict === "noise" || answer.edgePp <= MIN_EDGE_PP) return noise;

  const wideSpread = fund.spreadPp > SPREAD_THRESHOLD_PP;
  // An unknown stability is never read as stable, matching the engine.
  const stable = fund.stability !== null && fund.stability > STABILITY_THRESHOLD;

  if (fund.verdict === "marginal") {
    if (wideSpread && !stable) {
      return `${fact} Dates in this fund have differed by up to ${formatPp(fund.spreadPp)}, but not consistently, so the pattern may not hold.`;
    }
    if (stable && !wideSpread) {
      return `${fact} The same dates kept doing well across the history, but by very little: ${formatPp(answer.edgePp)} above the middle of the month.`;
    }
    // Marginal means exactly one test passed. An artifact that says otherwise is stale against
    // these constants, and the quietest line is the one to fall back to.
    return noise;
  }

  if (fund.verdict === "meaningful") {
    return `${fact} It sits ${formatPp(answer.edgePp)} above the middle of the month, over ${formatYears(fund.navFrom, fund.navTo)}.`;
  }

  return noise;
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

  // D21, which states this without exception: a caveat whenever the verdict isn't noise and the
  // fund has fewer than eight years of instalments. Its job is to defuse the SPREAD, not to
  // report the month count — so where the headline has already given the length, only the
  // opening clause changes. Dropping the sentence outright, an earlier attempt at the same
  // duplication, took the spread figure and the explanation with it on 170 of the 299 funds
  // that need them, including a 40-month fund whose page still showed "2.5% of final value".
  if (fund.verdict !== "noise" && fund.instalments < SETTLED_INSTALMENTS) {
    const headlineGaveLength = fund.confidence === "reduced" && fund.trimmedFrom === undefined;
    const opening = headlineGaveLength
      ? `A spread of ${formatPp(fund.spreadPp)}`
      : `This fund has ${fund.instalments} months of history, fewer than eight years. A spread of ${formatPp(fund.spreadPp)}`;
    // "is about what a history this short produces" would be false for the dozen funds carrying
    // two to four times their own length-cohort's median spread — the very funds the caveat
    // exists for. What is true at every magnitude is that it can't be told apart from noise.
    caveats.push(
      `${opening} is hard to tell apart from the noise a history this short produces, so this verdict reflects the length of the history as much as the fund.`,
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
function rupeeLineFor(
  fund: FundArtifact,
  answer: Answer,
): { before: string; gap: number; after: string; line: string } {
  const { highest, lowest } = corpusExtremes(fund, answer);
  // The gap between the two rows this sentence names, not fund.spreadRupees: the artifact rounds
  // every corpus independently, so for 237 of 994 funds the published spread is not the
  // difference of these two figures, and the sentence would fail a reader's own subtraction.
  const gap = highest.corpus - lowest.corpus;
  const shareOfValue = highest.corpus > 0 ? gap / highest.corpus : 0;
  const invested = fund.instalments * NOTIONAL_MONTHLY;
  // The span comes from the instalments, which is what the rupee figures were simulated over,
  // not from the NAV history. The two differ for 457 funds — one showed ₹5.2 lakh invested
  // "over 4.8 years", which at ₹10,000 a month is ₹5.76 lakh. Kotak hides it: its 164 months
  // and its 13.7-year NAV span agree, which is why the worked example never disambiguated them.
  const before = `For a notional ${formatRupees(NOTIONAL_MONTHLY)} monthly SIP, the highest- and lowest-value dates (the ${ordinal(highest.d)} and ${ordinal(lowest.d)}) ended `;
  const after = ` apart on ${formatLakh(invested)} invested, ${formatPercentOfValue(shareOfValue)} of the ${formatLakh(highest.corpus)} it grew to, over ${formatYearsOfMonths(fund.instalments)}.`;
  return { before, gap, after, line: `${before}${formatRupees(gap)}${after}` };
}

/** What a screen reader gets in place of the grid, which is aria-hidden. */
function srSummaryFor(answer: Answer): string {
  return `Best SIP day: the ${ordinal(answer.date)}.`;
}

export function answerCopy(fund: FundArtifact, answer: Answer): AnswerCopy {
  const rupees = rupeeLineFor(fund, answer);
  return {
    headline: headlineFor(fund, answer),
    caveats: caveatsFor(fund),
    rupeeLine: rupees.line,
    rupeeBefore: rupees.before,
    rupeeGap: rupees.gap,
    rupeeAfter: rupees.after,
    srSummary: srSummaryFor(answer),
  };
}
