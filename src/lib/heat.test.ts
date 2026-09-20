import { describe, expect, it } from "vitest";
import { MIN_INTENSITY, heatForMonth, heatSpanPp } from "./heat";

/** Each date's own XIRR, which is both what the cell prints and what the shading compares. */
const xirrs = (byDate: Record<number, number>) =>
  new Map(Object.entries(byDate).map(([date, value]) => [Number(date), value]));

describe("heatForMonth", () => {
  it("paints dates above today green, below today red, and today itself neutral", () => {
    // Today is the 10th at 16.92. The 12th beat it, the 5th fell short.
    const heat = heatForMonth(xirrs({ 5: 16.9, 10: 16.92, 12: 16.94 }), 10);

    expect(heat.get(12)?.direction).toBe("up");
    expect(heat.get(5)?.direction).toBe("down");
    expect(heat.get(10)?.direction).toBe("level");
  });

  it("gives the baseline no fill at all, so neutral cannot be mistaken for a faint one", () => {
    const heat = heatForMonth(xirrs({ 5: 16.9, 10: 16.92, 12: 16.94 }), 10);
    expect(heat.get(10)?.intensity).toBe(0);
  });

  it("reads a date whose figure equals the baseline's as level too", () => {
    // Not "up by zero": the colour would claim a direction the arithmetic does not have.
    const heat = heatForMonth(xirrs({ 4: 12.5, 10: 12.5, 20: 13 }), 10);
    expect(heat.get(4)?.direction).toBe("level");
    expect(heat.get(4)?.intensity).toBe(0);
  });

  it("paints the furthest date on each side fully, and nearer ones proportionally", () => {
    // Baseline 20.00. Up: +0.10 and +0.05. Down: −0.20 and −0.10.
    const heat = heatForMonth(xirrs({ 1: 20.1, 2: 20.05, 3: 20.0, 4: 19.9, 5: 19.8 }), 3);

    expect(heat.get(1)?.intensity).toBe(1);
    expect(heat.get(5)?.intensity).toBe(1);
    // Half the distance to its own extreme, so half the ramp above the floor.
    expect(heat.get(2)?.intensity).toBeCloseTo(MIN_INTENSITY + 0.5 * (1 - MIN_INTENSITY), 10);
    expect(heat.get(4)?.intensity).toBeCloseTo(MIN_INTENSITY + 0.5 * (1 - MIN_INTENSITY), 10);
  });

  it("scales each direction to its own extreme rather than to a shared span", () => {
    /*
     * The reason the two sides are separate. Here the greens run to +0.30 and the reds only to
     * −0.01. On one shared scale the 4th would paint at a thirtieth of the ramp — indistinguishable
     * from the baseline — when it is the worst date of the month and should be the deepest red.
     */
    const heat = heatForMonth(xirrs({ 1: 20.3, 2: 20.15, 3: 20.0, 4: 19.99 }), 3);

    expect(heat.get(1)?.intensity).toBe(1);
    expect(heat.get(4)?.direction).toBe("down");
    expect(heat.get(4)?.intensity).toBe(1);
  });

  it("never washes a date that differs from the baseline out to nothing", () => {
    // A hair above the baseline still gets the floor, because the difference is real and a
    // cell faded to nothing reads as missing data rather than as a small difference.
    const heat = heatForMonth(xirrs({ 1: 25, 3: 20.0, 7: 20.001 }), 3);
    expect(heat.get(7)?.intensity).toBeGreaterThanOrEqual(MIN_INTENSITY);
  });

  it("leaves every date level when the baseline date has no figure", () => {
    // Substituting a neighbouring date would silently change what every colour on the page
    // means, so the shading says nothing instead.
    const heat = heatForMonth(xirrs({ 5: 16.9, 12: 16.94 }), 9);

    expect(heat.get(5)?.direction).toBe("level");
    expect(heat.get(12)?.direction).toBe("level");
    expect(heat.size).toBe(2);
  });

  it("paints nothing when every date is identical", () => {
    const heat = heatForMonth(xirrs({ 3: 12, 4: 12, 5: 12 }), 4);
    for (const date of [3, 4, 5]) {
      expect(heat.get(date)?.direction).toBe("level");
      expect(heat.get(date)?.intensity).toBe(0);
    }
  });

  it("shades a fund that lost money on every date, since the comparison is still to today", () => {
    // Five published funds are negative on all 28. The colours say "better or worse than the
    // date you are on", not "profit or loss", and the figure in the cell says the rest.
    const heat = heatForMonth(xirrs({ 4: -9.52, 10: -9.0, 20: -8.59 }), 10);

    expect(heat.get(20)?.direction).toBe("up");
    expect(heat.get(4)?.direction).toBe("down");
  });

  it("returns an empty map for an empty input", () => {
    expect(heatForMonth(new Map(), 10).size).toBe(0);
  });
});

describe("heatSpanPp", () => {
  it("measures the weakest date to the strongest, whatever the baseline is", () => {
    expect(heatSpanPp(xirrs({ 5: 16.9, 12: 16.94, 24: 16.92 }))).toBeCloseTo(0.04, 10);
  });

  it("is zero for an empty input and for a fund whose dates are identical", () => {
    expect(heatSpanPp(new Map())).toBe(0);
    expect(heatSpanPp(xirrs({ 1: 12, 2: 12 }))).toBe(0);
  });
});
