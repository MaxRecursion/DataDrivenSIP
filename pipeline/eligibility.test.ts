import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayFromIso } from "./analysis/dates";
import { buildHistory, parseNavRows, type NavRow } from "./analysis/nav";
import { checkHistory, checkScheme, filterSchemes, trimAtDiscontinuity } from "./eligibility";
import type { SchemeSummary } from "./sources/types";

const TODAY = dayFromIso("2026-09-16");

const scheme = (over: Partial<SchemeSummary> = {}): SchemeSummary => ({
  code: 1,
  name: "Kotak Mid Cap Fund - Direct Plan - Growth",
  house: "Kotak Mahindra Mutual Fund",
  type: "Open Ended Schemes",
  category: "Equity Schemes - Mid Cap Fund",
  latestNavDate: dayFromIso("2026-09-15"),
  latestNav: 169.773,
  ...over,
});

describe("checkScheme: name rules", () => {
  it("keeps direct growth plans", () => {
    expect(checkScheme(scheme(), TODAY).ok).toBe(true);
    expect(checkScheme(scheme({ name: "quant Dynamic Asset Allocation Fund - Direct Plan - Growth Option" }), TODAY).ok).toBe(true);
  });

  it.each([
    ["Kotak Mid Cap Fund - Regular Plan - Growth", "not-direct-growth"],
    ["Kotak Mid Cap Fund - Direct Plan - IDCW", "not-direct-growth"],
    ["SBI Magnum Direct Plan - Growth - Dividend Payout", "income-option"],
    ["HDFC Top 100 - Direct Plan - Growth - Dividend Reinvestment", "income-option"],
    ["Some Fund - Direct Plan - Growth - Bonus", "income-option"],
    ["JM Liquid Fund - Unclaimed Dividend Direct Growth", "income-option"],
  ])("drops %s", (name, reason) => {
    const result = checkScheme(scheme({ name }), TODAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(reason);
  });

  it("keeps Dividend Yield funds, which the spec's regex wrongly dropped", () => {
    const name = "ICICI Prudential Dividend Yield Equity Fund - Direct Plan - Growth";
    expect(checkScheme(scheme({ name }), TODAY).ok).toBe(true);
  });

  it("matches Direct case-sensitively, so Indirect Plan is not Direct", () => {
    expect(checkScheme(scheme({ name: "Some Indirect Plan Growth" }), TODAY).ok).toBe(false);
  });
});

describe("checkScheme: product rules", () => {
  it.each([
    [{ type: "Close Ended Schemes" }, "not-open-ended"],
    [{ type: "Interval Fund Schemes" }, "not-open-ended"],
    // mfapi sometimes leaks a raw AMFI CSV line into schemeType.
    [{ type: "119416;INF955L01AN6;-;BARODA PIONEER LIQUID FUND - PLAN B", category: "DIRECT" }, "not-open-ended"],
    [{ name: "UTI Nifty Bank ETF - Direct Plan - Growth" }, "etf"],
    [{ name: "Nippon India ETF Gold BeES Direct Growth" }, "etf"],
    [{ name: "SBI Overnight Fund - Direct Plan - Growth" }, "overnight-or-liquid"],
    [{ name: "Axis Liquid Fund - Direct Plan - Growth" }, "overnight-or-liquid"],
    [{ name: "Bharat Bond FOF - April 2030 - Direct Plan - Growth" }, "target-maturity"],
    [{ name: "SBI CPSE Bond Plus SDL Sep 2026 50:50 Index Fund Direct Growth" }, "target-maturity"],
    [{ name: "Edelweiss Nifty PSU Bond Plus SDL Index Fund 2027 Direct Growth" }, "target-maturity"],
  ])("drops %j", (over, reason) => {
    const result = checkScheme(scheme(over as Partial<SchemeSummary>), TODAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(reason);
  });

  it("keeps an ordinary index fund that merely has a year in a different sense", () => {
    expect(checkScheme(scheme({ name: "UTI Nifty 50 Index Fund - Direct Plan - Growth" }), TODAY).ok).toBe(true);
  });
});

describe("checkScheme: liveness", () => {
  it("keeps a NAV from within twelve days", () => {
    expect(checkScheme(scheme({ latestNavDate: dayFromIso("2026-09-04") }), TODAY).ok).toBe(true);
  });

  it("drops a NAV older than twelve days", () => {
    const result = checkScheme(scheme({ latestNavDate: dayFromIso("2026-09-03") }), TODAY);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("stale");
  });

  it("drops a scheme with no usable NAV", () => {
    expect(checkScheme(scheme({ latestNav: null }), TODAY).reason).toBe("no-nav");
    expect(checkScheme(scheme({ latestNavDate: null }), TODAY).reason).toBe("no-nav");
    expect(checkScheme(scheme({ latestNav: 0 }), TODAY).reason).toBe("no-nav");
  });
});

describe("filterSchemes over the recorded live sample", () => {
  const sample = JSON.parse(
    readFileSync(new URL("./fixtures/mf-latest.sample.json", import.meta.url), "utf8"),
  ) as {
    schemeCode: number;
    schemeName: string;
    fundHouse: string;
    schemeType: string;
    schemeCategory: string;
    nav: string | null;
    date: string | null;
  }[];

  const schemes: SchemeSummary[] = sample.map((entry) => ({
    code: entry.schemeCode,
    name: entry.schemeName,
    house: entry.fundHouse,
    type: entry.schemeType,
    category: entry.schemeCategory,
    latestNav: entry.nav === null ? null : Number.parseFloat(entry.nav),
    latestNavDate: entry.date === null ? null : dayFromIso(entry.date.split("-").reverse().join("-")),
  }));

  it("keeps the two golden funds and accounts for every exclusion", () => {
    const { eligible, excluded } = filterSchemes(schemes, TODAY);
    const codes = eligible.map((entry) => entry.code);
    expect(codes).toContain(119775);
    expect(codes).toContain(151713);

    const counted = [...excluded.values()].reduce((sum, count) => sum + count, 0);
    expect(counted + eligible.length).toBe(schemes.length);
    expect([...excluded.keys()]).not.toContain(undefined);
  });

  it("never keeps a scheme whose type isn't open ended", () => {
    const { eligible } = filterSchemes(schemes, TODAY);
    expect(eligible.every((entry) => entry.type === "Open Ended Schemes")).toBe(true);
  });
});

describe("checkHistory: rules that need the NAVs themselves", () => {
  const daily = (from: string, to: string, nav: (index: number) => number = () => 10) => {
    const start = dayFromIso(from);
    const end = dayFromIso(to);
    const rows: NavRow[] = [];
    for (let day = start; day <= end; day++) rows.push({ day, nav: nav(day - start) });
    return buildHistory(rows);
  };

  it("needs at least 36 months", () => {
    expect(checkHistory(daily("2023-09-16", "2026-09-16", (i) => 10 + i * 0.01)).ok).toBe(true);
    const short = checkHistory(daily("2023-10-16", "2026-09-16", (i) => 10 + i * 0.01));
    expect(short.ok).toBe(false);
    expect(short.reason).toBe("too-short");
  });

  it("drops a fund whose NAV never moves", () => {
    const flat = checkHistory(daily("2020-01-01", "2026-09-16"));
    expect(flat.ok).toBe(false);
    expect(flat.reason).toBe("flat-nav");
  });

  it("drops a history left empty after zero NAVs are removed", () => {
    const rows = parseNavRows([{ date: "01-01-2020", nav: "0" }]);
    expect(rows).toHaveLength(0);
  });
});

describe("trimAtDiscontinuity", () => {
  const series = (from: string, to: string, nav: (index: number, day: number) => number) => {
    const start = dayFromIso(from);
    const end = dayFromIso(to);
    const rows: NavRow[] = [];
    for (let day = start; day <= end; day++) rows.push({ day, nav: nav(day - start, day) });
    return buildHistory(rows);
  };

  it("leaves an ordinary series alone", () => {
    const clean = series("2020-01-01", "2026-09-15", (i) => 100 * 1.0002 ** i);
    const result = trimAtDiscontinuity(clean);
    expect(result.trimmedAt).toBeNull();
    expect(result.history.rows).toHaveLength(clean.rows.length);
  });

  it("keeps a violent but believable market move", () => {
    // A 20% single-day fall is a crash, not a re-denomination.
    const crash = dayFromIso("2020-03-23");
    const result = trimAtDiscontinuity(
      series("2019-01-01", "2026-09-15", (i, day) => (day < crash ? 100 : 80) * 1.0001 ** i),
    );
    expect(result.trimmedAt).toBeNull();
  });

  it("cuts a hundredfold NAV re-denomination, keeping only what follows", () => {
    // The shape seen in real money market funds: 13 becomes 1,336 overnight.
    const jump = dayFromIso("2013-04-22");
    const result = trimAtDiscontinuity(
      series("2013-01-02", "2026-09-15", (i, day) => (day < jump ? 13 : 1336) * 1.0001 ** i),
    );
    expect(result.trimmedAt).toBe(jump);
    expect(result.history.first).toBe(jump);
    expect(result.history.rows.every((row) => row.nav > 1000)).toBe(true);
  });

  it("leaves too little history behind when the jump is recent, so the fund is dropped", () => {
    const jump = dayFromIso("2025-01-02");
    const trimmed = trimAtDiscontinuity(
      series("2013-01-02", "2026-09-15", (i, day) => (day < jump ? 13 : 1336) * 1.0001 ** i),
    );
    const check = checkHistory(trimmed.history);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("too-short");
  });
});
