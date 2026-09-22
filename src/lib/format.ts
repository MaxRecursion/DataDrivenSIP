/**
 * Every number the page shows passes through here, so a rupee, a percentage point and an
 * ordinal date read the same way everywhere. Date math is UTC only: a local-time Date would
 * shift a NAV date by a day for anyone west of India.
 */

const navDateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const rupeeGrouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const percentFormat = new Intl.NumberFormat("en-IN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const ordinalRules = new Intl.PluralRules("en-IN", { type: "ordinal" });

const LAKH = 100_000;
const CRORE = 10_000_000;
const MS_PER_DAY = 86_400_000;

/** The mean Gregorian year, so a span doesn't drift by the leap days it contains. */
const DAYS_PER_YEAR = 365.2425;

/** U+2212. Intl emits a hyphen-minus, which is too short to read as a sign next to figures. */
const MINUS = "−";

const withRealMinus = (text: string) => (text.startsWith("-") ? MINUS + text.slice(1) : text);

function parseIsoUtc(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function assertFinite(value: number): void {
  if (!Number.isFinite(value)) throw new Error(`Expected a finite number, got ${value}`);
}

/** Formats a YYYY-MM-DD calendar date as "11 September 2026". */
export function formatNavDate(isoDate: string): string {
  return navDateFormat.format(parseIsoUtc(isoDate));
}

/**
 * Whole rupees, grouped the Indian way: 60869 -> "₹60,869", 1640000 -> "₹16,40,000".
 * Paise are rounded away — they are noise against a corpus, and a trailing ".00" only adds
 * width. A negative sign sits outside the symbol, as "−₹500" rather than "₹−500".
 */
export function formatRupees(amount: number): string {
  assertFinite(amount);
  const rounded = Math.round(Math.abs(amount));
  // Guard the sign on the magnitude, not the input: −0.2 rounds to zero and must not print
  // as "−₹0".
  const sign = rounded > 0 && amount < 0 ? MINUS : "";
  return `${sign}₹${rupeeGrouping.format(rounded)}`;
}

/**
 * Money in the unit an Indian reader already thinks in: "₹16.4 lakh".
 *
 * Below a lakh there is no unit to gain, so it falls back to exact rupees — "₹0.6 lakh" hides
 * a number the reader can just as easily be shown. At a crore it switches again, and a figure
 * that would round to "₹100.0 lakh" is promoted to "₹1.0 crore" instead.
 */
export function formatLakh(amount: number): string {
  assertFinite(amount);
  const magnitude = Math.abs(amount);
  if (magnitude < LAKH) return formatRupees(amount);
  const sign = amount < 0 ? MINUS : "";
  const inLakh = (magnitude / LAKH).toFixed(1);
  if (magnitude < CRORE && Number(inLakh) < 100) return `${sign}₹${inLakh} lakh`;
  return `${sign}₹${(magnitude / CRORE).toFixed(1)} crore`;
}

const ORDINAL_SUFFIX: Record<ReturnType<Intl.PluralRules["select"]>, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
  zero: "th",
  many: "th",
};

/**
 * "12th", "21st". The suffix comes from Intl's ordinal plural rules rather than a hand-written
 * table, which is what keeps the teens right: 11, 12 and 13 are "other", not one/two/few.
 */
export function ordinal(n: number): string {
  return `${n}${ORDINAL_SUFFIX[ordinalRules.select(n)]}`;
}

/**
 * Percentage points, the unit the spread and the edge are measured in: "0.11 pp".
 *
 * A non-zero value that rounds away to "0.00" is shown as "<0.01 pp", because printing
 * "0.00 pp" would claim a difference is exactly nothing when it isn't. Exact zero keeps
 * "0.00 pp" — that one really is nothing. Below that threshold the magnitude is all the page
 * can honestly say, so the sign is dropped with it; every value this app formats (a spread,
 * an edge over the rest of the window) is non-negative anyway.
 */
export function formatPp(pp: number): string {
  assertFinite(pp);
  if (pp === 0) return "0.00 pp";
  const magnitude = Math.abs(pp);
  const rounded = magnitude.toFixed(2);
  // Compare the rendered string, not the input against 0.005: binary floats land on either
  // side of that boundary, and what matters is what the reader would see.
  if (rounded === "0.00") return "<0.01 pp";
  return `${pp < 0 ? MINUS : ""}${rounded} pp`;
}

/**
 * Takes a fraction, not a percentage: 0.008 -> "0.8%".
 *
 * Mirrors formatPp's floor for the same reason: "0.0%" would tell the reader a real share is
 * nothing at all. Exact zero keeps "0.0%", because that one is.
 */
export function formatPercentOfValue(fraction: number): string {
  assertFinite(fraction);
  if (fraction === 0) return percentFormat.format(0);
  const rendered = withRealMinus(percentFormat.format(fraction));
  return rendered === "0.0%" || rendered === `${MINUS}0.0%` ? "<0.1%" : rendered;
}

/**
 * The same figure as formatYears, measured in instalments instead of NAV days. A sentence whose
 * rupee amounts come from the common month set has to date itself from that set too, or its own
 * numbers won't reconcile: ₹10,000 a month over the span it states must equal the sum it states.
 */
/**
 * A date's own XIRR for a grid cell: "20.389".
 *
 * Three decimals, which is the precision the artifact stores and therefore the precision the
 * shading is ranked on. Two would be tidier and would print the same figure in cells the ramp
 * paints differently, which is a page disagreeing with itself. The unit is stated once nearby
 * rather than repeated twenty-eight times.
 */
export function formatXirr(xirr: number): string {
  assertFinite(xirr);
  const fixed = xirr.toFixed(3);
  // A rate of −0.0004 rounds to "-0.000", and a signed zero in a calendar cell claims a
  // direction the number does not have. `formatPp` guards the same way.
  return withRealMinus(fixed === "-0.000" ? "0.000" : fixed);
}

export function formatYearsOfMonths(months: number): string {
  assertFinite(months);
  return `${(months / 12).toFixed(1)} years`;
}

/**
 * How much history the answer rests on, to one decimal: "13.7 years". Expects navTo on or
 * after navFrom, which is how the pipeline always writes them.
 */
export function formatYears(navFrom: string, navTo: string): string {
  const span = parseIsoUtc(navTo).getTime() - parseIsoUtc(navFrom).getTime();
  return `${(span / MS_PER_DAY / DAYS_PER_YEAR).toFixed(1)} years`;
}

/**
 * A chart axis label, short enough that five fit on a phone: "₹40k", "₹1.2L", "₹0". Axis ticks
 * only — a figure a reader is meant to read exactly goes through formatRupees.
 */
export function formatRupeesAxis(rupees: number): string {
  assertFinite(rupees);
  const magnitude = Math.abs(rupees);
  const sign = rupees < 0 ? "−" : "";
  if (magnitude >= 100_000) return `${sign}₹${Number((magnitude / 100_000).toFixed(1))}L`;
  if (magnitude >= 1_000) return `${sign}₹${Math.round(magnitude / 1_000)}k`;
  return `${sign}₹${Math.round(magnitude)}`;
}

/**
 * A month's NAV change for the trending list: "+4.3%", "−1.2%", "0.0%". One decimal is all a
 * list needs, and the sign always shows, since "up" is the whole claim the list makes.
 */
export function formatSignedPercent(percent: number): string {
  assertFinite(percent);
  const rounded = Number(percent.toFixed(1));
  if (rounded === 0) return "0.0%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}%`;
}
