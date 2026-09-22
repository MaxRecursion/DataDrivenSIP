import { describe, expect, it } from "vitest";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { ledSeries, sharePercent, stabilityPercent } from "./charts";

describe("stabilityPercent", () => {
  it("maps the −1 to 1 score onto a 0 to 100 gauge", () => {
    expect(stabilityPercent(-1)).toBe(0);
    expect(stabilityPercent(0)).toBe(50);
    expect(stabilityPercent(1)).toBe(100);
  });

  it("puts the 0.60 verdict threshold at 80, where the gauge marks it", () => {
    expect(stabilityPercent(0.6)).toBeCloseTo(80, 10);
  });

  it("says nothing rather than drawing a zero when stability couldn't be measured", () => {
    expect(stabilityPercent(null)).toBeNull();
  });
});

describe("sharePercent", () => {
  it("turns a share into a percentage", () => {
    expect(sharePercent(0.641)).toBeCloseTo(64.1, 10);
    expect(sharePercent(0)).toBe(0);
  });

  it("returns null for a fund with no rolling stretches to have a share of", () => {
    expect(sharePercent(null)).toBeNull();
  });
});

const row = (d: number, w: number): DateResult => ({ d, xirr: 12, corpus: 1, meanPct: 50, topQ: 0.25, w });

describe("ledSeries", () => {
  it("lists how many stretches each date led, in date order, and which one is named", () => {
    const fund = { dates: [row(2, 5), row(1, 3), row(3, 9)], windows: 40 } as FundArtifact;
    expect(ledSeries(fund, 3)).toEqual({ dates: [1, 2, 3], led: [3, 5, 9], highlight: 2 });
  });

  it("returns null for a fund with no rolling stretches at all", () => {
    const fund = { dates: [row(1, 0)], windows: 0 } as FundArtifact;
    expect(ledSeries(fund, 1)).toBeNull();
  });
});
