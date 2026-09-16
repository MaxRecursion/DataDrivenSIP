import { describe, expect, it } from "vitest";
import { averageRanks, percentileOf, windowCredits } from "./rolling";

describe("averageRanks", () => {
  it("ranks highest first", () => {
    expect(averageRanks([3, 1, 2])).toEqual([1, 3, 2]);
  });

  it("gives tied values their average rank", () => {
    expect(averageRanks([5, 5, 1])).toEqual([1.5, 1.5, 3]);
    expect(averageRanks([1, 1, 1])).toEqual([2, 2, 2]);
  });
});

describe("percentileOf", () => {
  it("puts the best at 100 and the worst at 0", () => {
    expect(percentileOf(1, 28)).toBe(100);
    expect(percentileOf(28, 28)).toBe(0);
    expect(percentileOf(14.5, 28)).toBe(50);
  });
});

describe("windowCredits", () => {
  const values = Array.from({ length: 28 }, (_, i) => 28 - i); // date 1 highest, date 28 lowest

  it("credits the top quartile to the first seven ranks", () => {
    const { topQ, win } = windowCredits(values);
    expect(topQ.slice(0, 7)).toEqual(Array<number>(7).fill(1));
    expect(topQ.slice(7)).toEqual(Array<number>(21).fill(0));
    expect(win[0]).toBe(1);
    expect(win.slice(1)).toEqual(Array<number>(27).fill(0));
  });

  it("splits a tie that straddles the quartile boundary", () => {
    // Dates 7 and 8 tie, so they share ranks 7 and 8: half a top-quartile credit each.
    const tied = [...values];
    tied[7] = tied[6] ?? 0;
    const { topQ } = windowCredits(tied);
    expect(topQ[6]).toBeCloseTo(0.5, 12);
    expect(topQ[7]).toBeCloseTo(0.5, 12);
  });

  it("splits a win between tied leaders", () => {
    const tied = [...values];
    tied[1] = tied[0] ?? 0;
    const { win } = windowCredits(tied);
    expect(win[0]).toBeCloseTo(0.5, 12);
    expect(win[1]).toBeCloseTo(0.5, 12);
  });

  it("reports percentiles consistent with the ranks", () => {
    const { pct } = windowCredits(values);
    expect(pct[0]).toBe(100);
    expect(pct[27]).toBe(0);
  });
});
