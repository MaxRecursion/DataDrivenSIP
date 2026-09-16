import { describe, expect, it } from "vitest";
import { dayFromIso, isoFromDay } from "./dates";
import { buildHistory, parseNavRows } from "./nav";
import { spearman, splitHalves } from "./stability";

describe("spearman", () => {
  it("is 1 for the same ordering and -1 for the reverse", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 12);
  });

  it("matches a hand-computed correlation", () => {
    // Ranks [1,2,3,4] against [2,1,4,3]: 1 - 6*4/(4*15) = 0.6
    expect(spearman([4, 3, 2, 1], [3, 4, 1, 2])).toBeCloseTo(0.6, 12);
  });

  it("handles ties through average ranks", () => {
    expect(spearman([1, 2, 2, 3], [1, 2, 2, 3])).toBeCloseTo(1, 12);
  });

  it("returns null when either side has no variance", () => {
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2, 3], [7, 7, 7])).toBeNull();
  });

  it("returns null on mismatched lengths", () => {
    expect(spearman([1, 2], [1, 2, 3])).toBeNull();
  });
});

describe("splitHalves", () => {
  it("splits NAV rows by count, the first half taking the floor", () => {
    const history = buildHistory(
      parseNavRows(
        ["01", "02", "03", "04", "05"].map((day) => ({ date: `${day}-01-2020`, nav: "10" })),
      ),
    );
    const [first, second] = splitHalves(history);
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(3);
    expect(isoFromDay(first.last)).toBe("2020-01-02");
    expect(isoFromDay(second.first)).toBe("2020-01-03");
  });

  it("gives each half its own first and last day, so lookups can't cross the split", () => {
    const history = buildHistory(
      parseNavRows(
        Array.from({ length: 10 }, (_, i) => ({ date: `${String(i + 1).padStart(2, "0")}-01-2020`, nav: "10" })),
      ),
    );
    const [first, second] = splitHalves(history);
    expect(first.byDay.has(dayFromIso("2020-01-06"))).toBe(false);
    expect(second.byDay.has(dayFromIso("2020-01-05"))).toBe(false);
  });
});
