/**
 * "Why the 26th" — the three tiles that answer the question the headline raises.
 *
 * The page names one date, and a reader's next thought is why that one. These are the three
 * figures that justify it, in the order they answer: what the date returned, how far apart the
 * 28 dates were at all, and what that distance is worth in rupees. The third is the one that
 * usually deflates the first two, which is the point of showing them together.
 *
 * Pure, like the rest of /lib: every string is derived from the artifact and the copy already
 * built from it. Nothing here re-derives a figure that copy.ts or answer.ts has already
 * computed — the spread, the edge and the rupee gap each have exactly one source — so the
 * tiles cannot disagree with the sentences beside them.
 */
import type { FundArtifact } from "../../shared/artifacts";
import type { Answer } from "./answer";
import { xirrExtremes } from "./compare";
import { SPREAD_THRESHOLD_PP, STABILITY_THRESHOLD, type AnswerCopy } from "./copy";
import { formatPp, formatRupees, formatXirr, ordinal } from "./format";

export type Reason = {
  /** 1, 2, 3 — printed in the tile's badge. */
  n: number;
  title: string;
  /** The headline figure, already formatted and carrying its own unit. */
  figure: string;
  sub: string;
  /**
   * The rupee tile counts its figure up during the reveal, like the sentence it replaces
   * (PLAN.md §8.2). The other two are static: a percentage ticking upward reads as a rate
   * changing, which is exactly what it is not.
   */
  ticker?: { value: number };
};

/**
 * How the spread reads against the two fixed thresholds.
 *
 * Mirrors the verdict's own logic rather than restating its conclusion, because a reader who
 * has just seen "noise" deserves to know which of the two tests it failed. The thresholds are
 * imported, never written out as literals here: they are frozen, and moving them needs
 * explicit approval (CLAUDE.md).
 */
function spreadTest(spreadPp: number, stability: number | null): string {
  const wide = spreadPp > SPREAD_THRESHOLD_PP;
  const needs = `${SPREAD_THRESHOLD_PP} pp`;
  if (stability === null) {
    const opening = wide
      ? `Wider than the ${needs} a date effect needs, but`
      : `A date effect needs more than ${needs}, and`;
    return `${opening} there is too little variation to check whether the order of dates held.`;
  }

  const held = stability > STABILITY_THRESHOLD;
  const score = stability.toFixed(2);
  if (wide && held) {
    return `Wider than the ${needs} a date effect needs, and the order of dates held across the history (${score}, above ${STABILITY_THRESHOLD}).`;
  }
  if (wide) {
    return `Wider than the ${needs} a date effect needs, but the order of dates didn't hold (${score}, needs ${STABILITY_THRESHOLD}).`;
  }
  if (held) {
    return `Narrower than the ${needs} a date effect needs, though the order of dates held (${score}).`;
  }
  return `A date effect needs more than ${needs} and an order of dates that holds. This fund's order scored ${score}, short of ${STABILITY_THRESHOLD}.`;
}

export function reasonTiles(fund: FundArtifact, answer: Answer, copy: AnswerCopy): Reason[] {
  const { highest, lowest } = xirrExtremes(fund, answer);
  const range = `From the ${ordinal(lowest.d)} (${formatXirr(lowest.xirr)}%) up to the ${ordinal(highest.d)}. `;

  return [
    {
      n: 1,
      title: "Highest return of all 28 dates",
      figure: `${formatXirr(answer.result.xirr)}%`,
      sub: `Full-history XIRR, ${formatPp(answer.edgePp)} above the middle of the month (${formatXirr(answer.medianXirr)}%).`,
    },
    {
      n: 2,
      title: "How far apart the 28 dates are",
      figure: formatPp(fund.spreadPp),
      sub: range + spreadTest(fund.spreadPp, fund.stability),
    },
    {
      n: 3,
      title: "What the spread is worth",
      figure: formatRupees(copy.rupeeGap),
      sub:
        `Between the highest- and lowest-value dates (${copy.rupeeParts.pair}) on a notional ` +
        `${copy.rupeeParts.monthly} a month: ${copy.rupeeParts.share} of the ` +
        `${copy.rupeeParts.grewTo} it grew to over ${copy.rupeeParts.years}.`,
      ticker: { value: copy.rupeeGap },
    },
  ];
}
