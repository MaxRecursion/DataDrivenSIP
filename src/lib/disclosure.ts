/**
 * The three disclosure sections (PLAN.md §6.5, D7, D21).
 *
 * These are the sections a reader opens when they don't believe the headline, so they are
 * written to survive that reading. Every sentence is a fact this fund's own artifact carries:
 * nothing here is a rule of thumb, an average across funds, or an assertion the page can't
 * show the working for.
 *
 * Pure and total, like copy.ts: it reads the artifact and the pick and returns strings. It never
 * formats a number itself and never throws, because a thrown disclosure would take down a page
 * whose headline was fine.
 */
import type { FundArtifact } from "../../shared/artifacts";
import type { Answer } from "./answer";
import {
  formatLakh,
  formatNavDate,
  formatPercentOfValue,
  formatPp,
  formatRupees,
  ordinal,
} from "./format";

export type DisclosureCopy = {
  /** Under the chart. The chart's y-axis is zoomed, so this states what it is zoomed into. */
  chartCaption: string;
  /** "How confident is this?", in order. Only the lines that apply to this fund. */
  confidence: string[];
  /** "What actually matters", in order. */
  matters: string[];
};

/** The SIP the rupee figures are simulated on, matching copy.ts. */
const NOTIONAL_MONTHLY = 10_000;

/** Mirrors STABILITY_THRESHOLD in pipeline/analysis/verdict.ts. */
const STABILITY_THRESHOLD = 0.6;

/** A quarter of 28 dates: what a date would land in the top quartile by chance alone. */
const BY_CHANCE = 0.25;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
};

/**
 * Stability in plain words. It is the correlation between how the dates ranked in the first half
 * of the history and in the second, so it answers "did the same dates keep doing well?" — and a
 * negative one, which the threshold language alone would hide, means the order reversed.
 */
function stabilityLine(fund: FundArtifact): string {
  if (fund.stability === null) {
    return "There isn't enough variation in this fund's history to tell whether its dates kept their order, so the pattern behind the date can't be checked at all.";
  }

  const scale =
    "Splitting the history in half and ranking the dates in each half gives a score from −1 to 1: above 0.60 the same dates kept doing well, near 0 there was no pattern, and below 0 the order reversed between the halves.";

  if (fund.stability > STABILITY_THRESHOLD) {
    return `${scale} This fund scores ${fund.stability.toFixed(2)}, so the ordering did repeat.`;
  }
  if (fund.stability < 0) {
    return `${scale} This fund scores ${fund.stability.toFixed(2)}: the dates that did well in the first half tended to do badly in the second, which is what noise looks like.`;
  }
  return `${scale} This fund scores ${fund.stability.toFixed(2)}, so the ordering did not really repeat.`;
}

/**
 * D21's comparison, shown rather than asserted: this fund's spread beside the typical spread
 * for a fund with as much history. Without the second number the first one means nothing — a
 * spread of 0.77 pp is ordinary at 40 months and remarkable at 200.
 */
function cohortLine(fund: FundArtifact): string {
  const own = `Its 28 dates differ by ${formatPp(fund.spreadPp)} from end to end.`;
  if (fund.cohortSpreadPp === null) {
    return `${own} There are too few published funds with this much history to say what is typical for one, so there is nothing to compare it against.`;
  }

  const typical = `about ${formatPp(fund.cohortSpreadPp)} for a fund with a similar length of history`;
  if (fund.spreadPp > fund.cohortSpreadPp * 1.5) {
    return `${own} That is wider than ${typical}, so length alone doesn't account for all of it.`;
  }
  if (fund.spreadPp < fund.cohortSpreadPp * 0.67) {
    return `${own} That is narrower than ${typical}.`;
  }
  return `${own} That is close to ${typical}, so most of it is what a history this length produces on its own.`;
}

/**
 * The answer's top-quartile share against what chance alone would give it.
 *
 * The date is chosen on its full-history XIRR, which is one number over one stretch of time.
 * This is the check on that number: a date that also finished near the top across many rolling
 * 3-year stretches earned its rate, and one that didn't got it from a single good run.
 */
function quartileLine(fund: FundArtifact, answer: Answer): string {
  if (answer.result.topQ === null) {
    return "This fund has no rolling 3-year stretches to rank its dates over, so there is no track record behind the date beyond its all-history return.";
  }
  const share = formatPercentOfValue(answer.result.topQ);
  const chance = formatPercentOfValue(BY_CHANCE);
  if (answer.result.topQ > BY_CHANCE) {
    return `Across ${fund.windows} rolling 3-year stretches, the ${ordinal(answer.date)} finished in the top quarter of dates ${share} of the time. Chance alone would give it ${chance}.`;
  }
  return `Across ${fund.windows} rolling 3-year stretches, the ${ordinal(answer.date)} finished in the top quarter of dates only ${share} of the time, against the ${chance} chance alone would give it.`;
}

/**
 * How often each date actually led. The artifact publishes this as `w`, and the date is named on
 * its full-history XIRR rather than on leading, so the two can disagree — and where they do,
 * this says so. A reader who opens this section to check the headline deserves to find the
 * awkward number rather than a tidied one.
 */
function leaderLine(fund: FundArtifact, answer: Answer): string {
  if (fund.windows === 0) return "";

  const rows = fund.dates;
  const best = rows.reduce((leader, row) => (row.w > leader.w ? row : leader), rows[0] ?? answer.result);
  const own = answer.result.w;

  if (best.d === answer.date || best.w <= own) {
    return `Counting only the stretches each date led outright, the ${ordinal(answer.date)} led ${own.toFixed(0)} of them, more than any other date of the month.`;
  }
  return `Counting only the stretches each date led outright, the ${ordinal(answer.date)} led ${own.toFixed(0)} while the ${ordinal(best.d)} led ${best.w.toFixed(0)}. The date named above is the one with the highest return over the whole history, which is not the same as the one that led most often.`;
}

function confidenceLines(fund: FundArtifact, answer: Answer): string[] {
  const lines = [stabilityLine(fund), cohortLine(fund), quartileLine(fund, answer)];

  const leader = leaderLine(fund, answer);
  if (leader) lines.push(leader);

  if (!fund.metricsAgree) {
    lines.push(
      "The date with the highest return and the date that ended with the most money are not the same date here. When two measures of the same question disagree, the difference between the dates is noise.",
    );
  }

  if (fund.confidence === "reduced") {
    lines.push(
      fund.trimmedFrom === undefined
        ? `This fund is marked reduced confidence: ${fund.instalments} months of history leaves too few independent 3-year stretches for the numbers above to settle.`
        : `This fund is marked reduced confidence because its published history was cut at ${formatNavDate(fund.trimmedFrom)}. Everything above is measured on what survived, not on the fund's whole life.`,
    );
  }

  return lines;
}

function mattersLines(fund: FundArtifact, answer: Answer): string[] {
  const middle = median(fund.dates.map((row) => row.corpus));
  const edgeRupees = Math.round(answer.result.corpus - middle);

  const invested = fund.instalments * NOTIONAL_MONTHLY;
  const meanCorpus = fund.dates.reduce((total, row) => total + row.corpus, 0) / fund.dates.length;
  const perInstalment = Math.round(meanCorpus / fund.instalments);

  const edge =
    edgeRupees <= 0
      ? `On a notional ${formatRupees(NOTIONAL_MONTHLY)} a month, choosing the ${ordinal(answer.date)} over a typical date of the month ended with ${formatRupees(Math.abs(edgeRupees))} less, on ${formatLakh(invested)} invested. The date is named on its rate of return, and a rate and a rupee total can disagree — which is itself a sign the dates are close together.`
      : `On a notional ${formatRupees(NOTIONAL_MONTHLY)} a month, choosing the ${ordinal(answer.date)} over a typical date of the month was worth about ${formatRupees(edgeRupees)} on ${formatLakh(invested)} invested.`;

  const missed = `One instalment missed is ${formatRupees(NOTIONAL_MONTHLY)} never invested. Across this fund's history an instalment has been worth ${formatRupees(perInstalment)} today on average, and anywhere from ${formatRupees(fund.instalmentLow)} to ${formatRupees(fund.instalmentHigh)} depending on the month it went in — so the average is not a promise about yours.`;

  // D7 is explicit that "a missed instalment costs more than the date spread" is not safe to
  // assert universally, so this compares this fund's own two numbers and reports what it finds.
  const scale =
    perInstalment > Math.abs(edgeRupees)
      ? `Missing one instalment therefore costs more than the date does, by a wide margin.`
      : `For this fund the two are closer than usual, so neither figure dwarfs the other.`;

  // The one thing the shading cannot say for itself: a date is only worth choosing if the money
  // is there on it, and no arithmetic on this page knows when the reader is paid.
  const timing = `All of this assumes the instalment is funded on whichever date you pick. A SIP that bounces because the money hasn't arrived costs far more than any date here is worth.`;

  return [edge, missed, scale, timing];
}

export function disclosureCopy(fund: FundArtifact, answer: Answer): DisclosureCopy {
  return {
    chartCaption: `Top to bottom of this chart is ${formatPp(fund.spreadPp)} of XIRR. The axis is zoomed to this fund's own range, so the shape is visible at all.`,
    confidence: confidenceLines(fund, answer),
    matters: mattersLines(fund, answer),
  };
}
