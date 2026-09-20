import { describe, expect, it } from "vitest";
import { heatFromDeviations, heatSpanPp } from "./heat";

/** Deviations from the middle of the window, keyed by date — what the grid actually shades. */
const deviations = (byDate: Record<number, number>) =>
  new Map(Object.entries(byDate).map(([date, value]) => [Number(date), value]));

describe("heatFromDeviations", () => {
  it("runs red through amber to green, with the furthest date setting the scale", () => {
    // 5th lowest, 10th on the middle, 15th highest.
    const heat = heatFromDeviations(deviations({ 5: -0.3, 6: -0.2, 10: 0, 13: 0.9, 15: 1.1 }));

    expect(heat.get(15)).toEqual({ tone: "gain", intensity: 1 });
    // Red, but only as red as 0.3 deserves beside a 1.1. Saturating both ends equally would
    // draw a loss of a third of a point as loudly as a gain of more than a full one.
    expect(heat.get(5)?.tone).toBe("loss");
    expect(heat.get(5)?.intensity).toBeCloseTo(0.3 / 1.1, 10);
    // Amber is the absence of either ramp, so the middle paints at zero intensity.
    expect(heat.get(10)?.intensity).toBe(0);
  });

  it("shades in proportion, so a date two-thirds of the way out is two-thirds as strong", () => {
    const heat = heatFromDeviations(deviations({ 5: -0.3, 13: 0.9, 15: 1.1 }));

    // 0.9 against a furthest of 1.1.
    expect(heat.get(13)?.intensity).toBeCloseTo(0.9 / 1.1, 10);
    expect(heat.get(13)?.tone).toBe("gain");
    // 0.3 against the same 1.1: the red side is measured on the same scale as the green.
    expect(heat.get(5)?.intensity).toBeCloseTo(0.3 / 1.1, 10);
  });

  it("measures both sides against one furthest date, so red and green stay comparable", () => {
    // A fund that is far worse below the middle than above it must look far worse, not equally
    // saturated on both ends.
    const heat = heatFromDeviations(deviations({ 1: -1, 2: 0.1 }));

    expect(heat.get(1)?.intensity).toBe(1);
    expect(heat.get(2)?.intensity).toBeCloseTo(0.1, 10);
  });

  it("puts every date on the middle when they are all identical, rather than dividing by nothing", () => {
    for (const cell of heatFromDeviations(deviations({ 1: 0, 2: 0, 3: 0 })).values()) {
      expect(Number.isNaN(cell.intensity)).toBe(false);
      expect(cell.intensity).toBe(0);
    }
  });

  it("treats a date exactly on the middle as a gain, since nothing was given up", () => {
    expect(heatFromDeviations(deviations({ 1: 0, 2: 1 })).get(1)?.tone).toBe("gain");
  });

  it("keeps every intensity inside the ramp", () => {
    const heat = heatFromDeviations(deviations({ 1: -0.112, 2: 0.03, 3: 0, 4: 0.09 }));

    for (const cell of heat.values()) {
      expect(cell.intensity).toBeGreaterThanOrEqual(0);
      expect(cell.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("says nothing about dates it wasn't given", () => {
    expect(heatFromDeviations(new Map()).size).toBe(0);
    expect(heatFromDeviations(deviations({ 1: 0.1 })).has(2)).toBe(false);
  });
});

describe("heatSpanPp", () => {
  it("reports the real distance the ramp covers, which is the caption's whole job", () => {
    // Kotak: the ramp runs end to end across about a tenth of a percentage point.
    expect(heatSpanPp(deviations({ 1: -0.043, 2: 0.069 }))).toBeCloseTo(0.112, 10);
  });

  it("is zero when every date matches, rather than undefined", () => {
    expect(heatSpanPp(deviations({ 1: 0, 2: 0 }))).toBe(0);
    expect(heatSpanPp(new Map())).toBe(0);
  });
});
