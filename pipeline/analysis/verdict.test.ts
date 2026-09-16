import { describe, expect, it } from "vitest";
import { confidenceOf, verdictOf } from "./verdict";

// Spec §5.5, frozen: spreadPp > 0.25 and stability > 0.60 → meaningful; either → marginal; else noise.
describe("verdictOf", () => {
  it.each([
    [0.30, 0.70, "meaningful"],
    [0.26, 0.61, "meaningful"],
    [0.30, 0.60, "marginal"],
    [0.25, 0.61, "marginal"],
    [0.30, 0.50, "marginal"],
    [0.20, 0.70, "marginal"],
    [0.25, 0.60, "noise"],
    [0.114, 0.545, "noise"],
    [0.0, -1.0, "noise"],
  ])("spread %s pp with stability %s is %s", (spreadPp, stability, expected) => {
    expect(verdictOf(spreadPp, stability)).toBe(expected);
  });

  it("never treats an unknown stability as above the threshold", () => {
    expect(verdictOf(0.1, null)).toBe("noise");
    expect(verdictOf(0.7, null)).toBe("marginal");
  });
});

// PLAN.md D5. The verdict formula is untouched; this only labels how much history there is.
describe("confidenceOf", () => {
  it.each([
    [128, [82, 81], "full"],
    [24, [24, 24], "full"],
    [23, [82, 81], "reduced"],
    [128, [23, 30], "reduced"],
    [128, [30, 23], "reduced"],
    [5, [20, 20], "reduced"],
    [0, [10, 10], "reduced"],
  ])("%s windows and halves %j is %s", (windows, halves, expected) => {
    expect(confidenceOf(windows, halves as [number, number])).toBe(expected);
  });
});
