import { describe, expect, it } from "vitest";
import { MIN_INTENSITY, heatForMonth, heatSpanPp, strongestDate } from "./heat";

/** Each date's own XIRR, which is both what the cell prints and what the shading ranks. */
const xirrs = (byDate: Record<number, number>) =>
  new Map(Object.entries(byDate).map(([date, value]) => [Number(date), value]));

describe("heatForMonth", () => {
  it("paints the strongest date deepest and the weakest palest", () => {
    const heat = heatForMonth(xirrs({ 5: 16.9, 12: 16.94, 24: 16.92 }));

    expect(heat.get(12)?.intensity).toBe(1);
    expect(heat.get(5)?.intensity).toBe(MIN_INTENSITY);
    expect(heat.get(24)?.intensity).toBeGreaterThan(MIN_INTENSITY);
    expect(heat.get(24)?.intensity).toBeLessThan(1);
  });

  it("shades in proportion, so a date halfway up the range is painted halfway", () => {
    const heat = heatForMonth(xirrs({ 1: 10, 2: 15, 3: 20 }));
    expect(heat.get(2)?.intensity).toBeCloseTo(MIN_INTENSITY + 0.5 * (1 - MIN_INTENSITY), 10);
  });

  it("never fades a date to nothing, since every one of them is a date you could use", () => {
    for (const cell of heatForMonth(xirrs({ 1: 1, 2: 2, 3: 3, 4: 4 })).values()) {
      expect(cell.intensity).toBeGreaterThanOrEqual(MIN_INTENSITY);
      expect(cell.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("paints nothing as standing out when no date does, instead of dividing by nothing", () => {
    const heat = heatForMonth(xirrs({ 1: 20, 2: 20, 3: 20 }));

    for (const cell of heat.values()) {
      expect(Number.isNaN(cell.intensity)).toBe(false);
      expect(cell.intensity).toBe(MIN_INTENSITY);
    }
  });

  it("uses the whole ramp for a fund whose dates barely differ", () => {
    // Parag Parikh's 28 dates span 0.042 pp. The ramp still runs end to end, which is only
    // honest because the caption states the span and each cell prints its own figure.
    const heat = heatForMonth(xirrs({ 2: 16.897, 24: 16.931, 28: 16.937 }));

    expect(heat.get(2)?.intensity).toBe(MIN_INTENSITY);
    expect(heat.get(28)?.intensity).toBe(1);
  });

  it("stays green for a fund that lost money, because the ramp is relative", () => {
    // Five published funds are negative on all 28 dates. The colour says "strongest here" and
    // the figure in the cell says what "here" was worth, which is what keeps that honest.
    const heat = heatForMonth(xirrs({ 1: -9.52, 2: -8.59 }));

    expect(heat.get(2)?.intensity).toBe(1);
    expect(heat.get(1)?.intensity).toBe(MIN_INTENSITY);
  });

  it("says nothing about dates it wasn't given", () => {
    expect(heatForMonth(new Map()).size).toBe(0);
    expect(heatForMonth(xirrs({ 1: 5 })).has(2)).toBe(false);
  });
});

describe("heatSpanPp", () => {
  it("reports the real distance the ramp covers, which is the caption's whole job", () => {
    expect(heatSpanPp(xirrs({ 1: 20.276, 2: 20.389, 3: 20.3 }))).toBeCloseTo(0.113, 10);
  });

  it("is zero when every date matches, rather than undefined", () => {
    expect(heatSpanPp(xirrs({ 1: 20, 2: 20 }))).toBe(0);
    expect(heatSpanPp(new Map())).toBe(0);
  });
});

describe("strongestDate", () => {
  it("finds the date the ramp paints deepest", () => {
    expect(strongestDate(xirrs({ 5: 16.9, 12: 16.94, 24: 16.92 }))).toBe(12);
  });

  it("keeps the earliest date when two are exactly equal", () => {
    // Matching the pipeline's convention, so the mark never depends on map ordering.
    expect(strongestDate(xirrs({ 20: 16.94, 4: 16.94, 9: 16.9 }))).toBe(4);
  });

  it("has nothing to point at when there are no dates", () => {
    expect(strongestDate(new Map())).toBeNull();
  });
});
