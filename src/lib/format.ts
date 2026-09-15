const navDateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats a YYYY-MM-DD calendar date as "11 September 2026". */
export function formatNavDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
  const [, year, month, day] = match;
  return navDateFormat.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
}
