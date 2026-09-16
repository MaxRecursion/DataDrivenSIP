/**
 * Calendar arithmetic in whole UTC days. Every date in the engine is a day number, so no
 * local-time Date ever reaches the analysis (CLAUDE.md: date math is UTC-only).
 */

/** Whole days since 1970-01-01 UTC. */
export type DayNum = number;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAV_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

function toDay(year: number, month: number, day: number, input: string): DayNum {
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (
    Number.isNaN(ms) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Not a real calendar date: "${input}"`);
  }
  return ms / MS_PER_DAY;
}

/** "2026-09-11" → day number. */
export function dayFromIso(iso: string): DayNum {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${iso}"`);
  return toDay(Number(match[1]), Number(match[2]), Number(match[3]), iso);
}

/** "11-09-2026" → day number. This is how mfapi dates NAV rows. */
export function dayFromNavDate(date: string): DayNum {
  const match = NAV_DATE.exec(date);
  if (!match) throw new Error(`Expected DD-MM-YYYY, got "${date}"`);
  return toDay(Number(match[3]), Number(match[2]), Number(match[1]), date);
}

export function isoFromDay(day: DayNum): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Months as a single number (year × 12 + month), so month arithmetic is addition. */
export function monthIndexOf(day: DayNum): number {
  const date = new Date(day * MS_PER_DAY);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function firstOfMonth(monthIndex: number): DayNum {
  return Date.UTC(Math.floor(monthIndex / 12), monthIndex % 12, 1) / MS_PER_DAY;
}

export function daysInMonth(monthIndex: number): number {
  return new Date(Date.UTC(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 0)).getUTCDate();
}

/** The SIP target day: `dayOfMonth` of that month. Only ever called with 1–28. */
export function dayOfMonthTarget(monthIndex: number, dayOfMonth: number): DayNum {
  return Date.UTC(Math.floor(monthIndex / 12), monthIndex % 12, dayOfMonth) / MS_PER_DAY;
}

/** Keeps the day of the month, clamped to the target month's length (31 Jan + 1 month = 28 Feb). */
export function addMonths(day: DayNum, months: number): DayNum {
  const dayOfMonth = new Date(day * MS_PER_DAY).getUTCDate();
  const target = monthIndexOf(day) + months;
  return dayOfMonthTarget(target, Math.min(dayOfMonth, daysInMonth(target)));
}

/** ACT/365, the basis Excel's XIRR uses. */
export function yearsBetween(from: DayNum, to: DayNum): number {
  return (to - from) / 365;
}
