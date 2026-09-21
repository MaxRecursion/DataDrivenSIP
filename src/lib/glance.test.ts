import { describe, expect, it } from "vitest";
import { curvePoints } from "./glance";

describe("curvePoints", () => {
  it("maps each value onto a 0-to-1 vertical scale, highest value at 0 (SVG y grows downward)", () => {
    const points = curvePoints([10, 20, 15]);
    expect(points[0]).toBe(1); // lowest value, bottom of the icon
    expect(points[1]).toBe(0); // highest value, top of the icon
    expect(points[2]).toBeCloseTo(0.5, 10);
  });

  it("centres a flat series rather than dividing by zero", () => {
    // Every date identical: nothing to show a shape for, so the line sits flat in the middle
    // rather than collapsing to NaN or to one edge.
    const points = curvePoints([12, 12, 12, 12]);
    expect(points.every((y) => y === 0.5)).toBe(true);
  });

  it("returns an empty array for an empty series", () => {
    expect(curvePoints([])).toEqual([]);
  });

  it("keeps every date's own position, so the shape is the real curve, not a summary of it", () => {
    const xirrs = [20.1, 19.8, 20.3, 19.9, 20.0];
    expect(curvePoints(xirrs)).toHaveLength(5);
  });
});
