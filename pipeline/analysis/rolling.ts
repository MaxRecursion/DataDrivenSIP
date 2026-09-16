/**
 * Rolling 3-year windows (spec §5.4). A window starts on the 1st of a month that has a full
 * 36-month forward window, every date invests across those 36 months, and all 28 are valued on
 * the same day: the first NAV on or after the 1st of the month after the window.
 *
 * Valuing on or before that day would date some instalments after the valuation.
 */
import { firstOfMonth, monthIndexOf } from "./dates";
import { navOnOrAfter, type NavHistory } from "./nav";
import { simulateDate, SIP_DATES } from "./simulate";

export const WINDOW_MONTHS = 36;
/** A quartile of 28 dates is 7 ranks. */
export const TOP_QUARTILE_RANKS = 7;

export type RollingStats = {
  windows: number;
  meanPct: (number | null)[];
  topQ: (number | null)[];
  /** Windows led by each date, sharing the credit when leaders tie. */
  wins: number[];
};

/** Ranks values highest-first. Exact ties share their average rank. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
  const ranks = new Array<number>(values.length).fill(0);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]?.value === order[start]?.value) end++;
    const averageRank = (start + 1 + (end + 1)) / 2;
    for (let i = start; i <= end; i++) {
      const entry = order[i];
      if (entry) ranks[entry.index] = averageRank;
    }
    start = end + 1;
  }
  return ranks;
}

/** Rank 1 is 100, the last rank is 0. */
export function percentileOf(rank: number, count: number = SIP_DATES.length): number {
  return ((count - rank) / (count - 1)) * 100;
}

/** Per-date percentile, top-quartile credit and win credit for one window. */
export function windowCredits(values: readonly number[]): { pct: number[]; topQ: number[]; win: number[] } {
  const ranks = averageRanks(values);
  const tieSize = new Map<number, number>();
  for (const rank of ranks) tieSize.set(rank, (tieSize.get(rank) ?? 0) + 1);

  const pct: number[] = [];
  const topQ: number[] = [];
  const win: number[] = [];
  for (const rank of ranks) {
    const size = tieSize.get(rank) ?? 1;
    // A tie group of `size` occupies positions firstPosition … firstPosition + size - 1.
    const firstPosition = rank - (size - 1) / 2;
    const shareWithin = (limit: number) => Math.min(Math.max(limit - firstPosition + 1, 0), size) / size;
    pct.push(percentileOf(rank, values.length));
    topQ.push(shareWithin(TOP_QUARTILE_RANKS));
    win.push(shareWithin(1));
  }
  return { pct, topQ, win };
}

/** Month indices that start a full 36-month window inside the history. */
export function windowStarts(history: NavHistory): number[] {
  const starts: number[] = [];
  for (let month = monthIndexOf(history.first); firstOfMonth(month + WINDOW_MONTHS) <= history.last; month++) {
    if (firstOfMonth(month) >= history.first) starts.push(month);
  }
  return starts;
}

export function rollingStats(history: NavHistory): RollingStats {
  const count = SIP_DATES.length;
  const meanPct = new Array<number>(count).fill(0);
  const topQ = new Array<number>(count).fill(0);
  const wins = new Array<number>(count).fill(0);
  let windows = 0;

  for (const start of windowStarts(history)) {
    const terminal = navOnOrAfter(history, firstOfMonth(start + WINDOW_MONTHS));
    if (!terminal) continue;
    const months = Array.from({ length: WINDOW_MONTHS }, (_, offset) => start + offset);

    const rates: number[] = [];
    for (const d of SIP_DATES) {
      const rate = simulateDate(history, d, months, terminal.day).xirr;
      if (rate === null) break;
      rates.push(rate);
    }
    if (rates.length !== count) continue;

    const credits = windowCredits(rates);
    windows++;
    for (let i = 0; i < count; i++) {
      meanPct[i] = (meanPct[i] ?? 0) + (credits.pct[i] ?? 0);
      topQ[i] = (topQ[i] ?? 0) + (credits.topQ[i] ?? 0);
      wins[i] = (wins[i] ?? 0) + (credits.win[i] ?? 0);
    }
  }

  if (windows === 0) {
    return {
      windows: 0,
      meanPct: new Array<number | null>(count).fill(null),
      topQ: new Array<number | null>(count).fill(null),
      wins: new Array<number>(count).fill(0),
    };
  }
  return {
    windows,
    meanPct: meanPct.map((total) => total / windows),
    topQ: topQ.map((total) => total / windows),
    wins,
  };
}
