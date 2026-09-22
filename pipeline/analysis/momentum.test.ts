import { describe, expect, it } from "vitest";
import { dayFromIso } from "./dates";
import { MAX_BASE_GAP, MONTH_DAYS, monthReturn, topMovers } from "./momentum";
import { buildHistory, type NavHistory, type NavRow } from "./nav";

/** Built with the engine's own buildHistory, so the test sees exactly what run.ts passes in. */
const history = (rows: Array<[string, number]>): NavHistory =>
  buildHistory(rows.map(([iso, nav]) => ({ day: dayFromIso(iso), nav })));

describe("monthReturn", () => {
  it("compares today's NAV with the NAV a month earlier, as a percentage", () => {
    const result = monthReturn(history([["2026-08-19", 100], ["2026-09-01", 104], ["2026-09-18", 110]]));
    expect(result).toEqual({ lastDay: dayFromIso("2026-09-18"), monthPct: 10 });
  });

  it("uses the last NAV on or before the target day, since funds don't publish on holidays", () => {
    // The target is 2026-08-19, a day with no NAV; the 17th is the last print before it.
    const result = monthReturn(history([["2026-08-17", 50], ["2026-08-20", 60], ["2026-09-18", 55]]));
    expect(result?.monthPct).toBe(10);
  });

  it("refuses a base too far before the target, so a gap in the series can't pose as a month", () => {
    const target = dayFromIso("2026-09-18") - MONTH_DAYS;
    const tooOld = target - MAX_BASE_GAP - 1;
    const rows: NavRow[] = [{ day: tooOld, nav: 100 }, { day: dayFromIso("2026-09-18"), nav: 150 }];
    expect(monthReturn(buildHistory(rows))).toBeNull();
  });

  it("returns null for a history shorter than a month", () => {
    expect(monthReturn(history([["2026-09-10", 100], ["2026-09-18", 101]]))).toBeNull();
  });

  it("keeps a fall as a negative number and rounds to 3 dp", () => {
    const result = monthReturn(history([["2026-08-19", 30], ["2026-09-18", 29]]));
    expect(result?.monthPct).toBe(-3.333);
  });
});

describe("topMovers", () => {
  const day = dayFromIso("2026-09-18");
  const entries = [
    { code: 3, lastDay: day, monthPct: 4 },
    { code: 1, lastDay: day, monthPct: 9 },
    { code: 2, lastDay: day, monthPct: 9 },
    { code: 4, lastDay: day - 3, monthPct: 50 },
    { code: 5, lastDay: day, monthPct: -2 },
  ];

  it("ranks by the month's change, ties to the lower code, and keeps only funds priced today", () => {
    // Fund 4 has the largest change, but its NAV stopped three days ago: a stale price can't
    // be trending, and a fund that stopped publishing is the likeliest thing to look spiky.
    expect(topMovers(entries, day, 3).map((entry) => entry.code)).toEqual([1, 2, 3]);
  });

  it("returns at most the count asked for, and fewer when there are fewer funds", () => {
    expect(topMovers(entries, day)).toHaveLength(4);
    expect(topMovers(entries, day, 2)).toHaveLength(2);
    expect(topMovers([], day)).toEqual([]);
  });
});
