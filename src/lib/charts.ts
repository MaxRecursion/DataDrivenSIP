/**
 * The numbers behind the ApexCharts visuals in the disclosure sections. Pure: every figure is
 * one the artifact already carries, reshaped for a chart — nothing here is computed from a NAV
 * history, and nothing compares one fund with another.
 */
import type { FundArtifact } from "../../shared/artifacts";

/**
 * Stability runs −1 to 1; a gauge runs 0 to 100. The 0.60 verdict threshold lands at 80.
 * Null stays null, so a chart can say "not measurable" instead of drawing a confident zero.
 */
export function stabilityPercent(stability: number | null): number | null {
  return stability === null ? null : ((stability + 1) / 2) * 100;
}

/** A 0-to-1 share as a percentage, null when there were no stretches to take a share of. */
export function sharePercent(share: number | null): number | null {
  return share === null ? null : share * 100;
}

/**
 * How many rolling stretches each date led outright (`w`), in date order, plus the position
 * of the named day so the chart can mark it. Null for a fund with no rolling windows, where
 * every count would be a meaningless zero.
 */
export function ledSeries(
  fund: FundArtifact,
  answerDate: number,
): { dates: number[]; led: number[]; highlight: number } | null {
  if (fund.windows === 0) return null;
  const rows = [...fund.dates].sort((a, b) => a.d - b.d);
  return {
    dates: rows.map((row) => row.d),
    led: rows.map((row) => row.w),
    highlight: rows.findIndex((row) => row.d === answerDate),
  };
}
