/**
 * "Trending" for the search box: the funds whose NAV rose most over the past month.
 *
 * Named for what it measures. There are no usage figures anywhere in this project — no
 * analytics, no backend — so "trending" here cannot mean popular. It means recent price
 * momentum, and the page labels it that way. This is a ranking of funds by returns, which
 * CLAUDE.md forbade until the user lifted that rule on 2026-09-22.
 *
 * Pure, like the rest of analysis/: no I/O, no clock. The month is measured back from each
 * fund's own last NAV, and `topMovers` only keeps funds whose last NAV is the day being
 * published, so a fund that stopped pricing can't top the list on a stale number.
 */
import type { DayNum } from "./dates";
import type { NavHistory } from "./nav";

export const MONTH_DAYS = 30;
/** How far before the target day the base NAV may sit — a long weekend, not a missing month. */
export const MAX_BASE_GAP = 7;
export const TRENDING_COUNT = 5;

export type Momentum = { code: number; lastDay: DayNum; monthPct: number };

/** The change from the last NAV on or before a month ago to the latest NAV, in percent (3 dp). */
export function monthReturn(history: NavHistory): { lastDay: DayNum; monthPct: number } | null {
  const rows = history.rows;
  const latest = rows[rows.length - 1];
  if (!latest) return null;

  const target = latest.day - MONTH_DAYS;
  let base: (typeof rows)[number] | undefined;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]!;
    if (row.day <= target) {
      base = row;
      break;
    }
  }
  if (!base || target - base.day > MAX_BASE_GAP || base.nav <= 0) return null;

  const monthPct = Math.round((latest.nav / base.nav - 1) * 100_000) / 1000;
  return { lastDay: latest.day, monthPct };
}

/** The top `count` by the month's change among funds priced on `asOf`; ties to the lower code. */
export function topMovers(entries: readonly Momentum[], asOf: DayNum, count = TRENDING_COUNT): Momentum[] {
  return entries
    .filter((entry) => entry.lastDay === asOf)
    .sort((a, b) => b.monthPct - a.monthPct || a.code - b.code)
    .slice(0, count);
}
