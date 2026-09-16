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

/** A print that jumps this far and comes straight back was never a real price. */
const SPIKE_MOVE = 0.25;
const SPIKE_RETURN = 0.05;

/**
 * Drops a single row that jumps away from its neighbours and returns: 21.71 → 70.53 → 21.54
 * is a typo, not three days of trading. Left in, it buys units at a fictitious NAV and looks
 * like a re-denomination to the trimming rule.
 */
export function withoutSpikes(rows: readonly NavRow[]): NavRow[] {
  const kept: NavRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const previous = kept.at(-1);
    const row = rows[index];
    const next = rows[index + 1];
    if (!row) continue;
    if (previous && next && previous.nav > 0) {
      const jumped = Math.abs(row.nav - previous.nav) / previous.nav >= SPIKE_MOVE;
      const cameBack = Math.abs(next.nav - previous.nav) / previous.nav <= SPIKE_RETURN;
      if (jumped && cameBack) continue;
    }
    kept.push(row);
  }
  return kept;
}

/**
 * Parses mfapi rows and sorts them ascending. Rows whose NAV is zero, negative or
 * unparseable are dropped, and so are rows whose date isn't a real DD-MM-YYYY date: upstream
 * has been seen to emit odd payloads, and one bad row shouldn't cost the whole fund.
 * When a date appears twice, the first row in the given order wins.
 */
export function parseNavRows(rows: readonly { date: string; nav: string }[]): NavRow[] {
  const byDay = new Map<DayNum, number>();
  for (const row of rows) {
    const nav = Number.parseFloat(row.nav);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    let day: DayNum;
    try {
      day = dayFromNavDate(row.date);
    } catch {
      continue;
    }
    if (!byDay.has(day)) byDay.set(day, nav);
  }
  const sorted = [...byDay.entries()].map(([day, nav]) => ({ day, nav })).sort((a, b) => a.day - b.day);
  return withoutSpikes(sorted);
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
