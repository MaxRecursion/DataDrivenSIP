/**
 * Verdict grading (spec §5.5) and the confidence label (PLAN.md D5).
 *
 * The thresholds are frozen. "noise" is the correct answer for the overwhelming majority of
 * funds, and tuning these to produce more exciting results is forbidden (CLAUDE.md).
 */
import type { Confidence, Verdict } from "../../shared/artifacts";

export const SPREAD_THRESHOLD_PP = 0.25;
export const STABILITY_THRESHOLD = 0.6;

/** Below these, the history is too short for the rolling and split-half numbers to mean much. */
export const MIN_WINDOWS = 24;
export const MIN_HALF_INSTALMENTS = 24;

export function verdictOf(spreadPp: number, stability: number | null): Verdict {
  const wideSpread = spreadPp > SPREAD_THRESHOLD_PP;
  // An unknown stability is never treated as above the threshold.
  const stable = stability !== null && stability > STABILITY_THRESHOLD;
  if (wideSpread && stable) return "meaningful";
  if (wideSpread || stable) return "marginal";
  return "noise";
}

/** Labels how much history there is. It never changes the verdict. */
export function confidenceOf(windows: number, halfInstalments: readonly [number, number]): Confidence {
  const thinHalf = Math.min(...halfInstalments) < MIN_HALF_INSTALMENTS;
  return windows < MIN_WINDOWS || thinHalf ? "reduced" : "full";
}
