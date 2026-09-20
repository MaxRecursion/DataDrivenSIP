import { describe, expect, it } from "vitest";
import kotakFixture from "../../pipeline/fixtures/expected/kotak-full.json";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { pickAnswer } from "./answer";

// The artifact the pipeline actually writes for Kotak Mid Cap, NAVs to 2026-09-11.
const kotak = kotakFixture as unknown as FundArtifact;

/**
 * A fund whose 28 dates are identical apart from the rows a test overrides. Every date tying by
 * default is what isolates the rule: the overridden rows are the only ones that can lead, so
 * whichever of them wins says exactly what decided it.
 */
function fundWith(
  rows: Array<Partial<DateResult> & { d: number }>,
  extra: Partial<FundArtifact> = {},
): FundArtifact {
  const overrides = new Map(rows.map((row) => [row.d, row]));
  const dates = Array.from({ length: 28 }, (_, index) => ({
    d: index + 1,
    xirr: 20,
    corpus: 7_500_000,
    meanPct: 50 as number | null,
    topQ: 0.25 as number | null,
    w: 0,
    ...overrides.get(index + 1),
  }));
  return { ...kotak, dates, ...extra };
}

describe("pickAnswer", () => {
  it("names the date with the greatest full-history XIRR", () => {
    const fund = fundWith([
      { d: 6, xirr: 21.4 },
      { d: 19, xirr: 20.9 },
    ]);
    expect(pickAnswer(fund).date).toBe(6);
  });

  it("looks at all 28 dates, not a ten-date slice of them", () => {
    // The 26th would have been outside a default salary window, which used to make it
    // unreachable however well it did. Nothing excludes it now.
    const fund = fundWith([{ d: 26, xirr: 22 }]);
    expect(pickAnswer(fund).date).toBe(26);
  });

  it("ignores how a date ranked across rolling windows", () => {
    // The 5th ranks at the top on every rolling metric there is and still loses, because the
    // 6th earned more over the whole history. This is the rule that changed.
    const fund = fundWith([
      { d: 5, meanPct: 99, topQ: 1, w: 120, xirr: 20.1 },
      { d: 6, meanPct: 1, topQ: 0, w: 0, xirr: 20.2 },
    ]);
    expect(pickAnswer(fund).date).toBe(6);
  });

  it("ignores meanPct and topQ even when they are the only thing separating two dates", () => {
    // Identical XIRR, wildly different percentiles: the tie must fall to the earlier date
    // rather than to the better-ranked one.
    const fund = fundWith([
      { d: 9, meanPct: 10, topQ: 0.1, xirr: 20.5 },
      { d: 4, meanPct: 95, topQ: 0.9, xirr: 20.5 },
    ]);
    expect(pickAnswer(fund).date).toBe(4);
  });

  it("takes the earliest SIP day when the highest XIRR is tied", () => {
    const fund = fundWith([
      { d: 22, xirr: 20.75 },
      { d: 3, xirr: 20.75 },
      { d: 17, xirr: 20.75 },
    ]);
    expect(pickAnswer(fund).date).toBe(3);
  });

  it("still names the earliest date when every one of the 28 ties", () => {
    expect(pickAnswer(fundWith([])).date).toBe(1);
  });

  it("holds the tie-break on the date itself, not on the order the rows happen to arrive in", () => {
    const fund = fundWith([
      { d: 3, xirr: 20.75 },
      { d: 22, xirr: 20.75 },
    ]);
    fund.dates = [...fund.dates].reverse();
    expect(pickAnswer(fund).date).toBe(3);
  });

  it("names a date on a fund with no rolling windows at all", () => {
    // Nothing to rank by used to mean a different code path. There is only one path now.
    const fund = fundWith([{ d: 11, xirr: 22 }], { windows: 0, stability: null });
    expect(pickAnswer(fund).date).toBe(11);
  });

  it("hands back the artifact row for the date it names, so callers never re-search the fund", () => {
    const answer = pickAnswer(kotak);
    expect(answer.result.d).toBe(answer.date);
    expect(answer.result).toBe(kotak.dates[answer.date - 1]);
  });

  it("refuses to answer for a fund carrying no dates", () => {
    expect(() => pickAnswer({ ...kotak, dates: [] })).toThrow(/no dates/i);
  });
});

describe("edgePp", () => {
  it("is the named date's XIRR minus the median XIRR of all 28 SIP dates", () => {
    // 27 dates at 20 and one at 21: the median is 20, so the edge is exactly 1.
    const fund = fundWith([{ d: 6, xirr: 21 }]);
    const answer = pickAnswer(fund);

    expect(answer.date).toBe(6);
    expect(answer.edgePp).toBe(1);
  });

  it("measures against all 28, not against a ten-date window", () => {
    /*
     * Fourteen dates at 10 and fourteen at 30, so the median of all 28 is 20 and the answer's
     * edge is 10. Measured over only the back half of the month — the old behaviour — the
     * median would have been 30 and the edge 0.
     */
    const rows = Array.from({ length: 28 }, (_, index) => ({
      d: index + 1,
      xirr: index < 14 ? 10 : 30,
    }));
    const answer = pickAnswer(fundWith(rows));

    expect(answer.date).toBe(15);
    expect(answer.edgePp).toBe(10);
  });

  it("is zero when every date carries the same figure", () => {
    expect(pickAnswer(fundWith([])).edgePp).toBe(0);
  });

  it("is never negative, since the named date is the highest and the median cannot exceed it", () => {
    for (const fund of [kotak, fundWith([{ d: 2, xirr: 20.001 }])]) {
      expect(pickAnswer(fund).edgePp).toBeGreaterThanOrEqual(0);
    }
  });

  it("rounds to the 3 dp the pipeline stores XIRR at, dropping the float noise", () => {
    // Kotak's 26th is the highest at 20.389. The 14th and 15th of its sorted figures are 20.316
    // and 20.317, so the median is 20.3165 — a value binary floating point stores as
    // 20.316499999999998, which is exactly why the arithmetic runs in integer thousandths.
    const answer = pickAnswer(kotak);
    expect(answer.date).toBe(26);
    expect(answer.edgePp).toBe(0.0725);
  });
});

describe("pickAnswer against the published Kotak artifact", () => {
  it("names the date the engine measured as the fund's highest, which is acceptance criterion 3", () => {
    // PLAN.md §4 pins Kotak's best date at the 26th and its worst at the 9th on NAVs frozen to
    // 2026-09-11. The page now names exactly that date, where before it named whichever date
    // the salary window happened to allow.
    const answer = pickAnswer(kotak);
    const highest = Math.max(...kotak.dates.map((row) => row.xirr));

    expect(answer.date).toBe(26);
    expect(answer.result.xirr).toBe(highest);
  });

  it("gives the same answer however the page was reached, since nothing else feeds the pick", () => {
    expect(pickAnswer(kotak)).toEqual(pickAnswer({ ...kotak }));
  });
});
