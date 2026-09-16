/**
 * One SIP per date of the month (spec §5.3, PLAN.md §4).
 *
 * Two month rules, because they answer different questions:
 * - "per-date": every month in which that date could actually be invested. This is what the
 *   XIRR, rolling-window and stability numbers use, and it reproduces criterion 3.
 * - "common": the months in which all 28 dates could be invested. Rupee comparisons use it, so
 *   every date pays in the same number of instalments over the same months (PLAN.md D1).
 */
import { dayOfMonthTarget, monthIndexOf, type DayNum } from "./dates";
import { navAt, navOnOrAfter, type NavHistory } from "./nav";
import { xirr, type CashFlow } from "./xirr";

/** SIP dates are 1–28 only: not every month has a 29th, 30th or 31st. */
export const SIP_DATES: readonly number[] = Array.from({ length: 28 }, (_, index) => index + 1);
export const INSTALMENT = 10_000;

export type MonthRule = "per-date" | "common";

export type Simulation = {
  d: number;
  /** Annualised rate as a fraction, or null when no rate exists in the bracket. */
  xirr: number | null;
  corpus: number;
  units: number;
  instalments: number;
};

/** Months where this date is on or after the first NAV and a NAV follows within seven days. */
export function monthsForDate(history: NavHistory, d: number): number[] {
  const months: number[] = [];
  const lastMonth = monthIndexOf(history.last);
  for (let month = monthIndexOf(history.first); month <= lastMonth; month++) {
    const target = dayOfMonthTarget(month, d);
    if (target < history.first) continue;
    if (navOnOrAfter(history, target) === null) continue;
    months.push(month);
  }
  return months;
}

/**
 * Months where every date 1–28 can be invested. There's no first-NAV guard here: a target
 * before the fund's first NAV simply buys on that first NAV, within the seven-day rule.
 */
export function commonMonths(history: NavHistory): number[] {
  const months: number[] = [];
  const lastMonth = monthIndexOf(history.last);
  for (let month = monthIndexOf(history.first); month <= lastMonth; month++) {
    if (SIP_DATES.every((d) => navOnOrAfter(history, dayOfMonthTarget(month, d)) !== null)) months.push(month);
  }
  return months;
}

export function simulateDate(
  history: NavHistory,
  d: number,
  months: readonly number[],
  terminalDay: DayNum,
): Simulation {
  const flows: CashFlow[] = [];
  let units = 0;
  for (const month of months) {
    const bought = navOnOrAfter(history, dayOfMonthTarget(month, d));
    if (!bought) continue;
    units += INSTALMENT / bought.nav;
    // The cash flow is dated on the day the units were actually bought, not the target day.
    flows.push({ day: bought.day, amount: -INSTALMENT });
  }

  const terminalNav = navAt(history, terminalDay);
  if (terminalNav === null) throw new Error(`No NAV published on the terminal day ${terminalDay}`);
  const instalments = flows.length;
  const corpus = units * terminalNav;
  if (instalments > 0) flows.push({ day: terminalDay, amount: corpus });

  return { d, xirr: xirr(flows).rate, corpus, units, instalments };
}

export function simulateAll(
  history: NavHistory,
  rule: MonthRule,
  terminalDay: DayNum = history.last,
): Simulation[] {
  const shared = rule === "common" ? commonMonths(history) : null;
  return SIP_DATES.map((d) => simulateDate(history, d, shared ?? monthsForDate(history, d), terminalDay));
}
