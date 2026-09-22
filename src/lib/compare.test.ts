import { describe, expect, it } from "vitest";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import type { Answer } from "./answer";
import {
  compareDayCopy,
  mattersGlance,
  shareCopy,
  stickyCopy,
  todayCopy,
  verdictLabel,
  xirrExtremes,
  xirrExtremesLine,
} from "./compare";

const dateAt = (d: number, over: Partial<DateResult> = {}): DateResult => ({
  d,
  xirr: 20,
  corpus: 1_000_000,
  meanPct: 50,
  topQ: 0.25,
  w: 4,
  ...over,
});

const fund = (over: Partial<FundArtifact> = {}): FundArtifact => ({
  code: 1,
  name: "A Fund - Direct Plan - Growth",
  house: "A House",
  category: "Equity",
  navFrom: "2013-01-03",
  navTo: "2026-09-15",
  instalments: 164,
  dates: Array.from({ length: 28 }, (_, i) => dateAt(i + 1)),
  spreadPp: 0.11,
  spreadRupees: 1000,
  stability: 0.5,
  metricsAgree: true,
  verdict: "noise",
  windows: 100,
  confidence: "full",
  instalmentLow: 9_000,
  instalmentHigh: 20_000,
  cohortSpreadPp: 0.06,
  ...over,
});

const named = (d: number, over: Partial<DateResult> = {}): Answer => ({
  date: d,
  result: dateAt(d, { xirr: 20.3, corpus: 1_050_000, ...over }),
  edgePp: 0.03,
});

describe("verdictLabel", () => {
  it("names noise as noise", () => {
    expect(verdictLabel("noise")).toBe("Noise");
    expect(verdictLabel("marginal")).toBe("Thin edge");
    expect(verdictLabel("meaningful")).toBe("Date effect");
  });
});

describe("compareDayCopy", () => {
  it("says so when the tapped date is the named day", () => {
    const row = dateAt(26, { xirr: 20.3 });
    expect(compareDayCopy(row, row)).toBe("The 26th is the named day.");
  });

  it("states the XIRR gap and the rupee gap against the named day", () => {
    const answer = dateAt(26, { xirr: 20.3, corpus: 1_050_000 });
    const other = dateAt(5, { xirr: 20.2, corpus: 1_038_000 });
    expect(compareDayCopy(answer, other)).toBe(
      "The 5th sits 0.10 pp below the 26th. Notional SIP ended ₹12,000 lower.",
    );
  });

  it("does not print a signed zero when XIRR matches", () => {
    const answer = dateAt(26, { xirr: 20.3, corpus: 1_050_000 });
    const other = dateAt(5, { xirr: 20.3, corpus: 1_050_000 });
    expect(compareDayCopy(answer, other)).toBe(
      "The 5th and the 26th have the same full-history XIRR.",
    );
  });
});

describe("todayCopy", () => {
  it("explains that 29–31 are not SIP dates", () => {
    expect(todayCopy(30, dateAt(26, { xirr: 20.3 }), undefined)).toBe(
      "Today is the 30th, which is not a SIP date. The named day is the 26th.",
    );
  });

  it("says when today is the named day", () => {
    const row = dateAt(22, { xirr: 20.3 });
    expect(todayCopy(22, row, row)).toBe("Today is the named day, the 22nd.");
  });

  it("places today against the named day without repeating the rupee sentence", () => {
    const namedRow = dateAt(26, { xirr: 20.3 });
    const todayRow = dateAt(5, { xirr: 20.2 });
    expect(todayCopy(5, namedRow, todayRow)).toBe("Today is the 5th, 0.10 pp below the 26th.");
  });
});

describe("xirrExtremesLine", () => {
  it("is silent when every date has the same XIRR", () => {
    expect(xirrExtremesLine(fund(), named(12))).toBeNull();
  });

  it("names a different pair from the corpus extremes", () => {
    const dates = Array.from({ length: 28 }, (_, i) =>
      dateAt(i + 1, {
        corpus: i === 0 ? 2_000_000 : 1_000_000,
        xirr: i + 1 === 26 ? 21 : i + 1 === 9 ? 19 : 20,
      }),
    );
    const line = xirrExtremesLine(fund({ dates }), named(26, { xirr: 21 }));
    expect(line).toBe("The highest and lowest XIRR were on the 26th and the 9th.");
    expect(xirrExtremes(fund({ dates }), named(26, { xirr: 21 })).highest.d).toBe(26);
  });
});

describe("mattersGlance, share, sticky", () => {
  it("says a missed instalment is the larger cost when that is true", () => {
    expect(mattersGlance(80_000, 12_000)).toBe(
      "Missing one instalment costs more than picking this date over a typical one.",
    );
  });

  it("writes a share line that is not advice", () => {
    const text = shareCopy(fund({ name: "Kotak Mid Cap Fund - Direct Plan - Growth" }), named(26));
    expect(text).toBe(
      "Kotak Mid Cap Fund - Direct Plan - Growth: the 26th, noise, 0.11 pp range. Not advice.",
    );
  });

  it("packs the sticky summary", () => {
    expect(stickyCopy(fund(), named(26))).toBe("The 26th · Noise · 0.11 pp range");
  });

  it("keeps each decision-aid line under 80 characters", () => {
    const answer = named(26);
    const namedRow = dateAt(26, { xirr: 20.3, corpus: 1_050_000 });
    const other = dateAt(5, { xirr: 20.2, corpus: 1_038_000 });
    const lines = [
      verdictLabel("noise"),
      verdictLabel("marginal"),
      verdictLabel("meaningful"),
      compareDayCopy(namedRow, namedRow),
      compareDayCopy(namedRow, other),
      todayCopy(30, namedRow, undefined),
      todayCopy(26, namedRow, namedRow),
      todayCopy(5, namedRow, other),
      xirrExtremesLine(
        fund({
          dates: Array.from({ length: 28 }, (_, i) =>
            dateAt(i + 1, { xirr: i + 1 === 26 ? 21 : i + 1 === 9 ? 19 : 20 }),
          ),
        }),
        answer,
      ),
      mattersGlance(80_000, 12_000),
      mattersGlance(10_000, 12_000),
      shareCopy(fund({ name: "A Fund - Direct Plan - Growth" }), answer),
      stickyCopy(fund(), answer),
    ];
    for (const line of lines) {
      if (line === null) continue;
      expect(line.length, line).toBeLessThanOrEqual(80);
    }
  });
});
