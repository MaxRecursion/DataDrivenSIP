import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayFromIso } from "./dates";
import { npv, xirr, type CashFlow } from "./xirr";

type Fixture = { name: string; source: string; flows: { date: string; amount: number }[]; expected: number };

const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/xirr-fixtures.json", import.meta.url), "utf8"),
) as Fixture[];

const flows = (entries: [string, number][]): CashFlow[] =>
  entries.map(([date, amount]) => ({ day: dayFromIso(date), amount }));
const flowsOf = (fixture: Fixture): CashFlow[] =>
  fixture.flows.map((flow) => ({ day: dayFromIso(flow.date), amount: flow.amount }));

describe("xirr against the Phase 0 fixtures", () => {
  it("has all 15 fixtures, including published Excel results and a deeply negative series", () => {
    expect(fixtures).toHaveLength(15);
    expect(fixtures.map((f) => f.name)).toContain("ms-support-example");
    expect(fixtures.map((f) => f.name)).toContain("sip-12m-deeply-negative-approx-minus-80pct");
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))("matches %s to 4 decimals", (_name, fixture) => {
    const result = xirr(flowsOf(fixture));
    expect(result.rate).not.toBeNull();
    expect(result.rate as number).toBeCloseTo(fixture.expected, 4);
  });
});

describe("npv", () => {
  it("at a rate of zero is the sum of the flows", () => {
    const series = flows([["2020-01-01", -10000], ["2021-01-01", 5000], ["2022-01-01", 6000]]);
    expect(npv(series, 0)).toBeCloseTo(1000, 9);
  });

  it("discounts from the earliest flow, whatever order the flows arrive in", () => {
    const ordered = flows([["2020-01-01", -1000], ["2021-01-01", 1200]]);
    const shuffled = [...ordered].reverse();
    expect(npv(shuffled, 0.1)).toBeCloseTo(npv(ordered, 0.1), 12);
  });
});

describe("xirr edge cases", () => {
  it("returns a reason instead of a bracket end when the rate is above 300%", () => {
    expect(xirr(flows([["2020-01-01", -1000], ["2021-01-01", 5000]]))).toEqual({
      rate: null,
      reason: "no-sign-change",
    });
  });

  it("returns a reason when the loss is worse than 99%", () => {
    const result = xirr(flows([["2020-01-01", -1000], ["2021-01-01", 5]]));
    expect(result.rate).toBeNull();
  });

  it("needs at least one inflow, one outflow and two flows", () => {
    expect(xirr(flows([["2020-01-01", -1000], ["2021-01-01", -5]]))).toEqual({ rate: null, reason: "no-positive-flow" });
    expect(xirr(flows([["2020-01-01", 1000], ["2021-01-01", 5]]))).toEqual({ rate: null, reason: "no-negative-flow" });
    expect(xirr(flows([["2020-01-01", -1000]]))).toEqual({ rate: null, reason: "too-few-flows" });
    expect(xirr([])).toEqual({ rate: null, reason: "too-few-flows" });
  });

  it("doesn't assume NPV falls as the rate rises", () => {
    const normal = xirr(flows([["2024-01-08", -10000], ["2025-01-07", 11800]]));
    const inverted = xirr(flows([["2024-01-08", 10000], ["2025-01-07", -11800]]));
    expect(normal.rate).not.toBeNull();
    expect(inverted.rate as number).toBeCloseTo(normal.rate as number, 10);
  });

  it("is independent of the order flows are given in", () => {
    const fixture = fixtures.find((f) => f.name === "ms-support-example");
    expect(fixture).toBeDefined();
    const ordered = flowsOf(fixture as Fixture);
    const shuffled = [ordered[2], ordered[0], ordered[4], ordered[1], ordered[3]] as CashFlow[];
    expect(xirr(shuffled).rate as number).toBeCloseTo(xirr(ordered).rate as number, 12);
  });

  it("returns approximately zero when money comes back unchanged", () => {
    const result = xirr(flows([["2024-02-29", -50000], ["2026-02-28", 50000]]));
    expect(Math.abs(result.rate ?? 1)).toBeLessThan(1e-9);
  });

  it("solves a 164-instalment SIP quickly", () => {
    const monthly: [string, number][] = Array.from({ length: 164 }, (_, i) => {
      const month = 1 + (i % 12);
      const year = 2013 + Math.floor(i / 12);
      return [`${year}-${String(month).padStart(2, "0")}-05`, -10000];
    });
    const series = flows([...monthly, ["2026-09-11", 7_500_000]]);
    const started = performance.now();
    const result = xirr(series);
    expect(result.rate).not.toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });
});
