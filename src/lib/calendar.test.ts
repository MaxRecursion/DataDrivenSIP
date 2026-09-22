import { describe, expect, it } from "vitest";
import {
  MAX_SIP_DATE,
  addMonths,
  baselineDate,
  buildMonth,
  calendarDayInIndia,
  daysInMonth,
  monthLabel,
  monthOf,
  monthsAhead,
  sameMonth,
  weekdayLabels,
} from "./calendar";

describe("daysInMonth", () => {
  it("knows the short months and the long ones", () => {
    expect(daysInMonth({ year: 2026, month: 0 })).toBe(31);
    expect(daysInMonth({ year: 2026, month: 3 })).toBe(30);
  });

  it("gets February right in a leap year and out of one", () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 1 })).toBe(29);
    // The century rule: 2100 is not a leap year.
    expect(daysInMonth({ year: 2100, month: 1 })).toBe(28);
  });
});

describe("addMonths", () => {
  it("rolls into the next year rather than producing a thirteenth month", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 10 }, 3)).toEqual({ year: 2027, month: 1 });
  });

  it("rolls backwards without landing on a negative month", () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 1 }, -14)).toEqual({ year: 2024, month: 11 });
  });
});

describe("monthsAhead", () => {
  it("offers this month and the next three, which is as far as a reader may look", () => {
    const months = monthsAhead({ year: 2026, month: 10 });

    expect(months).toHaveLength(4);
    expect(months[0]).toEqual({ year: 2026, month: 10 });
    expect(months.at(-1)).toEqual({ year: 2027, month: 1 });
  });
});

describe("buildMonth", () => {
  it("puts the 1st in the column its weekday falls on", () => {
    // 1 October 2026 is a Thursday, so with weeks starting on Sunday it sits in column 4.
    const october = buildMonth({ year: 2026, month: 9 });
    const firstWeek = october.weeks[0] ?? [];

    expect(firstWeek.slice(0, 4).every((slot) => slot.day === null)).toBe(true);
    expect(firstWeek[4]?.day).toBe(1);
  });

  it("fills every row to seven, so the grid never has a ragged edge", () => {
    for (const month of [0, 1, 5, 9, 11]) {
      for (const week of buildMonth({ year: 2026, month }).weeks) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it("lays out every day of the month exactly once", () => {
    const key = { year: 2026, month: 9 };
    const days = buildMonth(key)
      .weeks.flat()
      .map((slot) => slot.day)
      .filter((day): day is number => day !== null);

    expect(days).toHaveLength(daysInMonth(key));
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it("draws the 29th to the 31st but never offers them as SIP dates", () => {
    // A SIP set for the 30th has no meaning as a monthly instruction: February has no 30th.
    // Omitting them would look like a bug, so they are drawn and marked unavailable.
    const slots = buildMonth({ year: 2026, month: 0 }).weeks.flat();
    const beyond = slots.filter((slot) => slot.day !== null && slot.day > MAX_SIP_DATE);

    expect(beyond).toHaveLength(3);
    expect(beyond.every((slot) => slot.sip === false)).toBe(true);
    expect(slots.filter((slot) => slot.sip)).toHaveLength(MAX_SIP_DATE);
  });

  it("marks the padding as unavailable too, so nothing empty looks clickable", () => {
    const padding = buildMonth({ year: 2026, month: 9 })
      .weeks.flat()
      .filter((slot) => slot.day === null);

    expect(padding.length).toBeGreaterThan(0);
    expect(padding.every((slot) => slot.sip === false)).toBe(true);
  });

  it("handles a February that starts on the first column with no padding at all", () => {
    // 1 February 2026 is a Sunday, and the month is exactly four weeks.
    const february = buildMonth({ year: 2026, month: 1 });

    expect(february.weeks).toHaveLength(4);
    expect(february.weeks[0]?.[0]?.day).toBe(1);
  });
});

describe("monthLabel and weekdayLabels", () => {
  it("names the month in full, so a two-digit month can't be misread", () => {
    expect(monthLabel({ year: 2026, month: 9 })).toContain("October");
    expect(monthLabel({ year: 2026, month: 9 })).toContain("2026");
  });

  it("starts the week on Sunday, as Indian calendars are printed", () => {
    const labels = weekdayLabels();
    expect(labels).toHaveLength(7);
    expect(labels[0]).toMatch(/^Sun/);
    expect(labels[6]).toMatch(/^Sat/);
  });
});

describe("monthOf", () => {
  it("reads the month in India, not in whatever zone the reader is sitting in", () => {
    // 2026-01-01T00:30Z is already the 1st in India (+5:30), and still December in New York.
    expect(monthOf(new Date("2026-01-01T00:30:00Z"))).toEqual({ year: 2026, month: 0 });
    // 2025-12-31T19:00Z is past midnight in India, so it is already January there.
    expect(monthOf(new Date("2025-12-31T19:00:00Z"))).toEqual({ year: 2026, month: 0 });
  });
});

describe("sameMonth", () => {
  it("compares the year as well as the month", () => {
    expect(sameMonth({ year: 2026, month: 0 }, { year: 2026, month: 0 })).toBe(true);
    expect(sameMonth({ year: 2026, month: 0 }, { year: 2027, month: 0 })).toBe(false);
  });
});

describe("baselineDate", () => {
  it("reads the day of the month in Asia/Kolkata, not in UTC", () => {
    // 19:00 UTC on the 20th is 00:30 on the 21st in Kolkata, which is +5:30. A UTC read would
    // compare the whole calendar against the wrong date for five and a half hours every night.
    expect(baselineDate(new Date("2026-09-20T19:00:00Z"))).toBe(21);
    expect(baselineDate(new Date("2026-09-20T18:00:00Z"))).toBe(20);
  });

  it("clamps the days that are not SIP dates back to the 28th", () => {
    // A reader looking at this on the 31st is compared against the 28th, because there is no
    // 31st to compare against and every date on the grid has to have a figure.
    for (const day of [29, 30, 31]) {
      expect(baselineDate(new Date(`2026-01-${day}T06:00:00Z`))).toBe(MAX_SIP_DATE);
      expect(calendarDayInIndia(new Date(`2026-01-${day}T06:00:00Z`))).toBe(day);
    }
  });

  it("leaves every real SIP date alone", () => {
    for (const day of [1, 2, 14, 27, 28]) {
      const stamp = String(day).padStart(2, "0");
      expect(baselineDate(new Date(`2026-03-${stamp}T06:00:00Z`))).toBe(day);
    }
  });

  it("is never outside the range the calendar can shade", () => {
    // Every day of a leap year, so a clamp that drifted by one would show up here.
    for (let offset = 0; offset < 366; offset++) {
      const day = baselineDate(new Date(Date.UTC(2024, 0, 1 + offset, 6)));
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(MAX_SIP_DATE);
    }
  });
});
