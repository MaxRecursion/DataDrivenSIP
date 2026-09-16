/**
 * NAV histories and the one lookup rule the whole engine uses (spec §5.1):
 * search the target day and the seven days after it, never backward, never interpolated.
 */
import { dayFromNavDate, type DayNum } from "./dates";

export const LOOK_AHEAD_DAYS = 7;

export type NavRow = { day: DayNum; nav: number };

export type NavHistory = {
  readonly rows: readonly NavRow[];
  readonly byDay: ReadonlyMap<DayNum, number>;
  readonly first: DayNum;
  readonly last: DayNum;
};

/** Parses mfapi rows, dropping NAVs that are zero, negative or unparseable, and sorts ascending. */
export function parseNavRows(rows: readonly { date: string; nav: string }[]): NavRow[] {
  const byDay = new Map<DayNum, number>();
  for (const row of rows) {
    const nav = Number.parseFloat(row.nav);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    const day = dayFromNavDate(row.date);
    if (!byDay.has(day)) byDay.set(day, nav);
  }
  return [...byDay.entries()].map(([day, nav]) => ({ day, nav })).sort((a, b) => a.day - b.day);
}

export function buildHistory(rows: readonly NavRow[]): NavHistory {
  const sorted = [...rows].sort((a, b) => a.day - b.day);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) throw new Error("A NAV history needs at least one row");
  return {
    rows: sorted,
    byDay: new Map(sorted.map((row) => [row.day, row.nav])),
    first: first.day,
    last: last.day,
  };
}

/** The first NAV on or within seven days after `target`, or null. Never rolls backward. */
export function navOnOrAfter(history: NavHistory, target: DayNum, lookAheadDays = LOOK_AHEAD_DAYS): NavRow | null {
  for (let day = target; day <= target + lookAheadDays; day++) {
    const nav = history.byDay.get(day);
    if (nav !== undefined) return { day, nav };
  }
  return null;
}

/** The NAV published on exactly this day, or null. */
export function navAt(history: NavHistory, day: DayNum): number | null {
  return history.byDay.get(day) ?? null;
}
