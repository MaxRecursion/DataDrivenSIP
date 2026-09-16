/**
 * The PLAN.md §4 rules that the golden fixtures exercise only indirectly: window boundaries,
 * the windows that get dropped, split-half behaviour, the flow-dating convention, and the
 * paths where a fund can't be analysed at all.
 */
import { describe, expect, it } from "vitest";
import { analyse, AnalysisError } from "./analyse";
import { dayFromIso, dayOfMonthTarget, isoFromDay, monthIndexOf } from "./dates";
import { buildHistory, parseNavRows, type NavHistory, type NavRow } from "./nav";
import { rollingStats, windowStarts } from "./rolling";
import { INSTALMENT, monthsForDate, simulateAll, simulateDate } from "./simulate";
import { splitHalfStability } from "./stability";
import { xirr, type CashFlow } from "./xirr";

const meta = { code: 1, name: "Test Fund", house: "Test AMC", category: "Test Category" };

const historyOf = (entries: [string, number][]): NavHistory =>
  buildHistory(entries.map(([iso, nav]) => ({ day: dayFromIso(iso), nav })));

function dailyHistory(from: string, to: string, navAt: (day: number, index: number) => number = () => 10): NavHistory {
  const start = dayFromIso(from);
  const end = dayFromIso(to);
  const rows: NavRow[] = [];
  for (let day = start; day <= end; day++) rows.push({ day, nav: navAt(day, day - start) });
  return buildHistory(rows);
}

describe("a fund with no month common to all 28 dates", () => {
  // Alternating months publish NAVs only in their first or second half, so every month has a
  // gap longer than seven days for some dates.
  const alternating = (() => {
    const rows: NavRow[] = [];
    let month = monthIndexOf(dayFromIso("2014-01-01"));
    for (let index = 0; index < 132; index++, month++) {
      const firstHalf = index % 2 === 0;
      for (let d = firstHalf ? 1 : 15; d <= (firstHalf ? 14 : 28); d++) {
        rows.push({ day: dayOfMonthTarget(month, d), nav: 10 + index * 0.1 });
      }
    }
    return buildHistory(rows);
  })();

  it("is rejected instead of producing an artifact full of zeroes", () => {
    expect(() => analyse(alternating, meta)).toThrow(AnalysisError);
    try {
      analyse(alternating, meta);
    } catch (error) {
      expect((error as AnalysisError).reason).toBe("no-common-months");
    }
  });

  it("still simulates the per-date rule, which is what makes the artifact look plausible", () => {
    expect(simulateAll(alternating, "per-date").every((simulation) => simulation.instalments > 0)).toBe(true);
    expect(simulateAll(alternating, "common").every((simulation) => simulation.instalments === 0)).toBe(true);
  });
});

describe("cash flows are dated on the day units were bought", () => {
  // NAVs only on the 5th and 20th, so a SIP on the 1st always buys on the 5th. The NAV rises
  // slowly, so the rate stays inside the bracket: a fast-growing toy fund returns null on
  // both sides, and null - null is 0, which would make these comparisons vacuous.
  const history = historyOf([
    ["2020-01-05", 100],
    ["2020-01-20", 100.5],
    ["2020-02-05", 101],
    ["2020-02-20", 101.5],
    ["2020-03-05", 102],
    ["2020-03-20", 102.5],
    ["2020-04-05", 103],
    ["2020-04-20", 103.5],
    ["2020-05-05", 104],
    ["2020-05-20", 104.5],
    ["2020-06-05", 105],
    ["2020-06-20", 105.5],
  ]);
  // February to June: January's 1st is before the first NAV.
  const units = INSTALMENT * (1 / 101 + 1 / 102 + 1 / 103 + 1 / 104 + 1 / 105);
  const terminal = { day: dayFromIso("2020-06-20"), amount: units * 105.5 };

  it("matches flows built by hand on the actual NAV dates", () => {
    const months = monthsForDate(history, 1);
    expect(months).toHaveLength(5);
    const simulation = simulateDate(history, 1, months, history.last);

    const byHand: CashFlow[] = [
      ...["2020-02-05", "2020-03-05", "2020-04-05", "2020-05-05", "2020-06-05"].map((date) => ({
        day: dayFromIso(date),
        amount: -INSTALMENT,
      })),
      terminal,
    ];
    expect(simulation.corpus).toBeCloseTo(units * 105.5, 9);
    expect(simulation.xirr).not.toBeNull();
    expect(simulation.xirr as number).toBeCloseTo(xirr(byHand).rate as number, 12);
  });

  it("gives a different rate from dating the flows on the target day", () => {
    const simulation = simulateDate(history, 1, monthsForDate(history, 1), history.last);
    const targetDated: CashFlow[] = [
      ...["2020-02-01", "2020-03-01", "2020-04-01", "2020-05-01", "2020-06-01"].map((date) => ({
        day: dayFromIso(date),
        amount: -INSTALMENT,
      })),
      terminal,
    ];
    const onTargetDays = xirr(targetDated).rate;
    expect(simulation.xirr).not.toBeNull();
    expect(onTargetDays).not.toBeNull();
    expect(Math.abs((simulation.xirr as number) - (onTargetDays as number))).toBeGreaterThan(1e-6);
  });
});

describe("simulateDate", () => {
  const history = dailyHistory("2020-01-01", "2020-12-31");

  it("throws when the terminal day has no NAV, rather than valuing at nothing", () => {
    expect(() => simulateDate(history, 1, monthsForDate(history, 1), history.last + 1)).toThrow(/terminal day/);
  });
});

describe("window boundaries", () => {
  it("counts a window only when both its ends fall inside the history", () => {
    // Exactly 36 months plus a day: one window, starting January 2020.
    const exact = dailyHistory("2020-01-01", "2023-01-01");
    expect(windowStarts(exact)).toHaveLength(1);
    expect(rollingStats(exact).windows).toBe(1);

    // The same history starting a day later: the 1st of January is before the first NAV.
    const late = dailyHistory("2020-01-02", "2023-01-01");
    expect(windowStarts(late)).toHaveLength(0);
    expect(rollingStats(late).windows).toBe(0);
  });

  it("drops a window whose valuation day has no NAV within seven days", () => {
    const gapped = dailyHistory("2020-01-01", "2023-02-15", () => 10);
    const withoutJanuary = buildHistory(
      gapped.rows.filter((row) => {
        const iso = isoFromDay(row.day);
        return !(iso >= "2023-01-01" && iso <= "2023-01-10");
      }),
    );
    expect(windowStarts(withoutJanuary)).toHaveLength(2); // January and February 2020
    expect(rollingStats(withoutJanuary).windows).toBe(1); // the January window loses its valuation
  });

  it("drops a window where a date has no rate inside the bracket", () => {
    // The NAV collapses by 99.99%, so every window's XIRR is below -99%.
    const collapsed = dailyHistory("2020-01-01", "2023-02-15", (day) =>
      day < dayFromIso("2023-01-01") ? 100 : 0.01,
    );
    const stats = rollingStats(collapsed);
    expect(stats.windows).toBe(0);
    expect(stats.meanPct.every((value) => value === null)).toBe(true);
    expect(stats.wins.every((value) => value === 0)).toBe(true);
  });
});

describe("splitHalfStability", () => {
  const flat = dailyHistory("2020-01-01", "2025-01-31");

  it("reports null when every date ties, and still counts both halves", () => {
    const result = splitHalfStability(flat);
    expect(result.stability).toBeNull();
    expect(result.instalments[0]).toBeGreaterThan(0);
    expect(result.instalments[1]).toBeGreaterThan(0);
  });

  it("returns a correlation between -1 and 1 for a fund that actually moves", () => {
    const wobbly = dailyHistory("2015-01-01", "2025-01-31", (_day, index) => 100 + index * 0.05 + Math.sin(index / 9) * 6);
    const result = splitHalfStability(wobbly);
    expect(result.stability).not.toBeNull();
    expect(Math.abs(result.stability as number)).toBeLessThanOrEqual(1);
  });
});

describe("analyse on a flat fund", () => {
  const artifact = analyse(dailyHistory("2015-01-01", "2025-01-31"), meta);

  it("has no spread, an unknown stability, and grades itself noise", () => {
    expect(artifact.spreadPp).toBe(0);
    expect(artifact.spreadRupees).toBe(0);
    expect(artifact.stability).toBeNull();
    expect(artifact.verdict).toBe("noise");
  });

  it("breaks the metricsAgree tie on the lowest date, so an all-tie fund agrees", () => {
    expect(artifact.metricsAgree).toBe(true);
  });

  it("never writes NaN into the artifact", () => {
    const numbers = [
      artifact.spreadPp,
      artifact.spreadRupees,
      artifact.instalments,
      artifact.windows,
      ...artifact.dates.flatMap((date) => [date.xirr, date.corpus, date.w]),
    ];
    expect(numbers.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe("parseNavRows guards", () => {
  it("drops rows whose date isn't a real DD-MM-YYYY date instead of failing the fund", () => {
    const parsed = parseNavRows([
      { date: "03-01-2013", nav: "14.052" },
      { date: "N.A.", nav: "11" },
      { date: "31-02-2013", nav: "12" },
      { date: "2013-01-04", nav: "13" },
      { date: "04-01-2013", nav: "14.1" },
    ]);
    expect(parsed.map((row) => isoFromDay(row.day))).toEqual(["2013-01-03", "2013-01-04"]);
  });

  it("keeps the first row when a date repeats", () => {
    const parsed = parseNavRows([
      { date: "03-01-2013", nav: "99" },
      { date: "03-01-2013", nav: "14.052" },
    ]);
    expect(parsed).toEqual([{ day: dayFromIso("2013-01-03"), nav: 99 }]);
  });
});
