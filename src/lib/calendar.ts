/**
 * Laying the SIP dates out as a real month.
 *
 * The analysis is month-agnostic: a SIP date is "the 24th", the same 24th in every month of a
 * thirteen-year history. A calendar is the opposite — it has a weekday alignment and a length,
 * both of which change month to month. This turns one into the other.
 *
 * Two consequences worth stating, because they are not arbitrary.
 *
 * Dates 29, 30 and 31 are laid out but carry nothing. SIP dates stop at 28 (CLAUDE.md) because
 * February has no 29th in three years out of four, so a SIP set for the 30th has no meaning as
 * a monthly instruction. They are drawn so the month looks like the month, and marked as not
 * available rather than quietly omitted, which would look like a bug.
 *
 * Everything here is UTC. A local-time `Date` would put the 1st of the month on the previous
 * day for anyone west of India and shift the whole grid by a column.
 *
 * Pure: no clock of its own. The caller says which month, so the component can decide when it
 * is allowed to read a clock — which is after mount, never during the prerender.
 */

/** SIP dates run 1–28 (CLAUDE.md). Everything past this is drawn but inert. */
export const MAX_SIP_DATE = 28;

/** How far ahead the reader may look. The current month plus three. */
export const MONTHS_AHEAD = 3;

/** Sunday, as Indian calendars are usually printed. */
export const WEEK_STARTS_ON = 0;

export type Slot = {
  /** The day of the month, or null for the padding before the 1st and after the last. */
  day: number | null;
  /** Whether a SIP can be set for this day at all. False for padding and for 29–31. */
  sip: boolean;
};

export type MonthKey = { year: number; month: number };

export type CalendarMonth = MonthKey & {
  /** "October 2026". */
  label: string;
  /** Rows of seven, starting on WEEK_STARTS_ON. */
  weeks: Slot[][];
};

const monthFormat = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });

/** "Sun", "Mon", … in the order the weeks are laid out. */
export function weekdayLabels(): string[] {
  // Any week will do; 4 January 1970 was a Sunday, so day 0 of this run is a Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    weekdayFormat.format(new Date(Date.UTC(1970, 0, 4 + ((WEEK_STARTS_ON + index) % 7)))),
  );
}

export function monthLabel({ year, month }: MonthKey): string {
  return monthFormat.format(new Date(Date.UTC(year, month, 1)));
}

/** Day 0 of the next month is the last day of this one. */
export function daysInMonth({ year, month }: MonthKey): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The month `offset` months after this one, rolling the year over as needed. */
export function addMonths({ year, month }: MonthKey, offset: number): MonthKey {
  const total = year * 12 + month + offset;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** The months a reader may look at: this one and the next `MONTHS_AHEAD`. */
export function monthsAhead(from: MonthKey, count: number = MONTHS_AHEAD): MonthKey[] {
  return Array.from({ length: count + 1 }, (_, offset) => addMonths(from, offset));
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Which weekday the 1st falls on, counted from WEEK_STARTS_ON. */
function leadingBlanks({ year, month }: MonthKey): number {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return (firstWeekday - WEEK_STARTS_ON + 7) % 7;
}

/** The month laid out in rows of seven, padded at both ends so every row is full. */
export function buildMonth(key: MonthKey): CalendarMonth {
  const total = daysInMonth(key);
  const blank: Slot = { day: null, sip: false };

  const slots: Slot[] = [
    ...Array.from({ length: leadingBlanks(key) }, () => blank),
    ...Array.from({ length: total }, (_, index) => ({
      day: index + 1,
      // 29–31 are real days of the month and are never SIP dates.
      sip: index + 1 <= MAX_SIP_DATE,
    })),
  ];
  while (slots.length % 7 !== 0) slots.push(blank);

  const weeks: Slot[][] = [];
  for (let start = 0; start < slots.length; start += 7) weeks.push(slots.slice(start, start + 7));

  return { ...key, label: monthLabel(key), weeks };
}

/** The month a given instant falls in, in India — the timezone the NAV day is defined in. */
export function monthOf(now: Date): MonthKey {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const [year, month] = parts.split("-").map(Number);
  return { year: year ?? 1970, month: (month ?? 1) - 1 };
}
