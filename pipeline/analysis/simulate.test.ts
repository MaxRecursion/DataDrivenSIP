import { describe, expect, it } from "vitest";
import { dayFromIso, isoFromDay, type DayNum } from "./dates";
import { buildHistory, type NavHistory, type NavRow } from "./nav";
import { commonMonths, INSTALMENT, monthsForDate, simulateAll, simulateDate, SIP_DATES } from "./simulate";

/** A NAV for every calendar day, growing at a fixed annual rate. */
function dailyHistory(from: string, to: string, annualRate = 0, startNav = 10): NavHistory {
  const start = dayFromIso(from);
  const end = dayFromIso(to);
  const rows: NavRow[] = [];
  for (let day = start; day <= end; day++) {
    rows.push({ day, nav: startNav * (1 + annualRate) ** ((day - start) / 365) });
  }
  return buildHistory(rows);
}

function historyWithout(from: string, to: string, skip: (day: DayNum) => boolean): NavHistory {
  const rows = dailyHistory(from, to).rows.filter((row) => !skip(row.day));
  return buildHistory(rows);
}

describe("SIP_DATES", () => {
  it("is 1 to 28 and never 29, 30 or 31", () => {
    expect(SIP_DATES).toHaveLength(28);
    expect(SIP_DATES[0]).toBe(1);
    expect(SIP_DATES.at(-1)).toBe(28);
  });
});

describe("a flat NAV", () => {
  const history = dailyHistory("2020-01-01", "2025-01-31");

  it("returns an XIRR of zero and a corpus of exactly what was paid in", () => {
    for (const simulation of simulateAll(history, "per-date")) {
      expect(simulation.instalments).toBe(61); // January 2020 to January 2025
      expect(simulation.corpus).toBeCloseTo(61 * INSTALMENT, 6);
      expect(Math.abs(simulation.xirr ?? 1)).toBeLessThan(1e-9);
    }
  });
});

describe("a steadily growing NAV", () => {
  const history = dailyHistory("2020-01-01", "2025-01-31", 0.12);

  it("returns that growth rate for every date", () => {
    for (const simulation of simulateAll(history, "per-date")) {
      expect(simulation.xirr ?? 0).toBeCloseTo(0.12, 4);
    }
  });
});

describe("month rules", () => {
  // NAVs every day from 5 January 2020 to 10 March 2021.
  const history = dailyHistory("2020-01-05", "2021-03-10");

  it("skips a month when the target falls before the fund's first NAV", () => {
    // The 1st of January 2020 is before the first NAV, so January is out for date 1.
    expect(monthsForDate(history, 1)).toHaveLength(14);
    expect(monthsForDate(history, 10)).toHaveLength(15);
  });

  it("skips a month when no NAV is published within seven days of the target", () => {
    // The 28th of March 2021 is past the last NAV, so March is out for date 28.
    expect(monthsForDate(history, 28)).toHaveLength(14);
  });

  it("uses one common set of months so every date invests the same number of times", () => {
    const months = commonMonths(history);
    expect(months).toHaveLength(14); // January 2020 to February 2021
    const simulations = simulateAll(history, "common");
    expect(new Set(simulations.map((s) => s.instalments))).toEqual(new Set([14]));
  });

  it("buys on the next published NAV when the target day has none", () => {
    // No NAVs from the 8th to the 13th of February 2021.
    const gapped = historyWithout("2020-01-05", "2021-03-10", (day) => {
      const iso = isoFromDay(day);
      return iso >= "2021-02-08" && iso <= "2021-02-13";
    });
    expect(monthsForDate(gapped, 10)).toHaveLength(15); // the 10th rolls to the 14th
  });

  it("drops the month when the gap is longer than seven days", () => {
    const gapped = historyWithout("2020-01-05", "2021-03-10", (day) => {
      const iso = isoFromDay(day);
      return iso >= "2021-02-08" && iso <= "2021-02-20";
    });
    expect(monthsForDate(gapped, 10)).toHaveLength(14);
  });
});

describe("simulateDate", () => {
  const history = dailyHistory("2020-01-01", "2020-12-31");

  it("values the units at the terminal NAV, on the terminal day", () => {
    const months = monthsForDate(history, 1);
    const simulation = simulateDate(history, 1, months, history.last);
    expect(simulation.instalments).toBe(12);
    expect(simulation.units).toBeCloseTo((12 * INSTALMENT) / 10, 6);
    expect(simulation.corpus).toBeCloseTo(simulation.units * 10, 6);
  });

  it("returns a null XIRR rather than throwing when no rate exists", () => {
    const simulation = simulateDate(history, 1, [], history.last);
    expect(simulation.instalments).toBe(0);
    expect(simulation.xirr).toBeNull();
  });
});
