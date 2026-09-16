import { describe, expect, it } from "vitest";
import {
  addMonths,
  dayFromIso,
  dayFromNavDate,
  dayOfMonthTarget,
  firstOfMonth,
  isoFromDay,
  monthIndexOf,
  yearsBetween,
} from "./dates";

describe("day numbers", () => {
  it("parses mfapi and ISO dates to the same UTC day number", () => {
    expect(dayFromNavDate("11-09-2026")).toBe(dayFromIso("2026-09-11"));
    expect(dayFromIso("1970-01-01")).toBe(0);
    expect(dayFromIso("2026-09-11")).toBe(Date.UTC(2026, 8, 11) / 86_400_000);
  });

  it("round-trips to ISO", () => {
    for (const iso of ["2013-01-03", "2020-02-29", "2026-09-11"]) {
      expect(isoFromDay(dayFromIso(iso))).toBe(iso);
    }
  });

  it("rejects malformed dates instead of guessing", () => {
    expect(() => dayFromNavDate("2026-09-11")).toThrow();
    expect(() => dayFromIso("11-09-2026")).toThrow();
    expect(() => dayFromNavDate("31-02-2026")).toThrow();
    expect(() => dayFromNavDate("")).toThrow();
  });
});

describe("months", () => {
  it("indexes months so that arithmetic is plain addition", () => {
    const january2013 = monthIndexOf(dayFromIso("2013-01-03"));
    expect(isoFromDay(firstOfMonth(january2013))).toBe("2013-01-01");
    expect(isoFromDay(dayOfMonthTarget(january2013, 28))).toBe("2013-01-28");
    expect(isoFromDay(firstOfMonth(january2013 + 36))).toBe("2016-01-01");
    expect(monthIndexOf(dayFromIso("2026-09-11")) - january2013).toBe(164);
  });

  it("adds months keeping the day, clamped to the month's length", () => {
    expect(isoFromDay(addMonths(dayFromIso("2023-01-31"), 1))).toBe("2023-02-28");
    expect(isoFromDay(addMonths(dayFromIso("2023-03-15"), 36))).toBe("2026-03-15");
    expect(isoFromDay(addMonths(dayFromIso("2024-02-29"), 12))).toBe("2025-02-28");
  });
});

describe("yearsBetween", () => {
  it("counts actual days over 365, the basis Excel's XIRR uses", () => {
    expect(yearsBetween(dayFromIso("2020-01-01"), dayFromIso("2021-01-01"))).toBeCloseTo(366 / 365, 12);
    expect(yearsBetween(dayFromIso("2013-01-03"), dayFromIso("2026-09-11"))).toBeCloseTo(13.696, 3);
  });
});
