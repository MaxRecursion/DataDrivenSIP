/**
 * Split-half stability (spec §5.4): rank the 28 dates in each half of the history and correlate
 * the two orderings. It's the best noise detector available, and for funds near the 0.60
 * threshold the split rule decides the verdict, so it is pinned: halves are NAV rows by count,
 * and each half is simulated as if it were a whole history (PLAN.md §4, D2).
 */
import { buildHistory, type NavHistory } from "./nav";
import { averageRanks } from "./rolling";
import { monthsForDate, simulateDate, SIP_DATES } from "./simulate";

export function pearson(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanA = mean(a);
  const meanB = mean(b);
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (varianceA === 0 || varianceB === 0) return null;
  return covariance / Math.sqrt(varianceA * varianceB);
}

/** Spearman: Pearson over average ranks. */
export function spearman(a: readonly number[], b: readonly number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  return pearson(averageRanks(a), averageRanks(b));
}

/** Splits the NAV rows in two by count, the first half taking the floor. */
export function splitHalves(history: NavHistory): [NavHistory, NavHistory] {
  const half = Math.floor(history.rows.length / 2);
  return [buildHistory(history.rows.slice(0, half)), buildHistory(history.rows.slice(half))];
}

export type StabilityResult = {
  stability: number | null;
  /** Smallest instalment count in each half, which feeds the confidence label. */
  instalments: [number, number];
};

export function splitHalfStability(history: NavHistory): StabilityResult {
  const halves = splitHalves(history);
  const rates: number[][] = [];
  const instalments: number[] = [];

  for (const half of halves) {
    const simulations = SIP_DATES.map((d) => simulateDate(half, d, monthsForDate(half, d), half.last));
    instalments.push(Math.min(...simulations.map((simulation) => simulation.instalments)));
    const solved = simulations.map((simulation) => simulation.xirr);
    if (solved.some((rate) => rate === null)) return { stability: null, instalments: [instalments[0] ?? 0, instalments[1] ?? 0] };
    rates.push(solved as number[]);
  }

  return {
    stability: spearman(rates[0] ?? [], rates[1] ?? []),
    instalments: [instalments[0] ?? 0, instalments[1] ?? 0],
  };
}
