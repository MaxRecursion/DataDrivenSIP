import { describe, expect, it } from "vitest";
import kotakFixture from "../../pipeline/fixtures/expected/kotak-full.json";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { pickAnswer, windowEdges } from "./answer";
import { DEFAULT_BUFFER, DEFAULT_PARAMS, MAX_BUFFER, type Salary } from "./url";
import { WINDOW_LENGTH, safeWindow } from "./window";

// The artifact the pipeline actually writes for Kotak Mid Cap, NAVs to 2026-09-11.
const kotak = kotakFixture as unknown as FundArtifact;

/**
 * A fund whose 28 dates are identical apart from the rows a test overrides. Every date tying by
 * default is what isolates one rung of the tie-break ladder at a time: the overridden rows are
 * the only ones that can lead, so whichever of them wins says exactly which rung decided it.
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

/** A fund too young for rolling 3-year windows: null percentiles and `windows: 0`. */
function youngFund(xirrByDate: Record<number, number>): FundArtifact {
  const dates = Array.from({ length: 28 }, (_, index) => ({
    d: index + 1,
    xirr: xirrByDate[index + 1] ?? 7,
    corpus: 400_000,
    meanPct: null,
    topQ: null,
    w: 0,
  }));
  return {
    ...kotak,
    dates,
    instalments: 30,
    windows: 0,
    stability: null,
    verdict: "noise",
    confidence: "reduced",
  };
}

const window3to12 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("pickAnswer", () => {
  it("answers with how a date ranked across rolling windows, not with the highest XIRR", () => {
    // The 5th ranked well over 3-year stretches; the 6th only looks good on the all-history rate,
    // which is the single number the percentile metrics exist to distrust.
    const fund = fundWith([
      { d: 5, meanPct: 90, xirr: 19.5 },
      { d: 6, meanPct: 10, xirr: 25 },
    ]);
    expect(pickAnswer(fund, window3to12).date).toBe(5);
  });

  it("separates dates that ranked equally on average by how often they ranked near the top", () => {
    // Same mean percentile, and the 3rd has the better XIRR, so only topQ can decide this.
    const fund = fundWith([
      { d: 3, meanPct: 70, topQ: 0.4, xirr: 20.9 },
      { d: 4, meanPct: 70, topQ: 0.9, xirr: 20.1 },
    ]);
    expect(pickAnswer(fund, window3to12).date).toBe(4);
  });

  it("falls through to XIRR only when both percentile metrics are level", () => {
    const fund = fundWith([
      { d: 3, meanPct: 70, topQ: 0.5, xirr: 20.1 },
      { d: 4, meanPct: 70, topQ: 0.5, xirr: 20.2 },
    ]);
    expect(pickAnswer(fund, window3to12).date).toBe(4);
  });

  it("takes the earliest date in the window when nothing separates the candidates", () => {
    // Nothing to choose between them, so the answer is the first date after salary lands: the
    // user waits the fewest days, and a shorter wait is the only real difference left.
    const fund = fundWith([
      { d: 3, meanPct: 70, topQ: 0.5, xirr: 20.5 },
      { d: 9, meanPct: 70, topQ: 0.5, xirr: 20.5 },
    ]);
    expect(pickAnswer(fund, window3to12).date).toBe(3);
  });

  it("reads 'earliest' as the position in the window, so a wrapped window still waits least", () => {
    // Salary on the 26th with no buffer wraps the window through the turn of the month. The 1st
    // is the smaller number but comes four days later than the 26th, and the pick must say 26th.
    const window = safeWindow({ salary: 26, buffer: 0 });
    expect(window).toEqual([26, 27, 28, 1, 2, 3, 4, 5, 6, 7]);

    const fund = fundWith([
      { d: 26, meanPct: 70, topQ: 0.5, xirr: 20.5 },
      { d: 1, meanPct: 70, topQ: 0.5, xirr: 20.5 },
    ]);
    expect(pickAnswer(fund, window).date).toBe(26);
  });

  it("ranks on XIRR alone for a fund too young to have rolling windows", () => {
    // With `windows: 0` there are no percentiles to rank by, and the 9th has the highest rate.
    const fund = youngFund({ 5: 7.4, 9: 7.9, 12: 7.6 });
    expect(pickAnswer(fund, window3to12).date).toBe(9);
  });

  it("still answers when a window is tied and there are no percentiles, taking the earliest", () => {
    const fund = youngFund({});
    expect(pickAnswer(fund, safeWindow({ salary: 26, buffer: 0 })).date).toBe(26);
  });

  it("never reads a null percentile as a zero score", () => {
    // A fund with windows but null percentiles shouldn't exist. If it ever did, scoring null as
    // zero would hand the answer to whichever date happened to keep its numbers; ordering the
    // whole window on XIRR instead is at least honest about what is known.
    const fund = fundWith(
      [
        { d: 4, meanPct: null, topQ: null, xirr: 20.1 },
        { d: 8, meanPct: null, topQ: null, xirr: 20.7 },
        { d: 11, meanPct: 99, topQ: 1, xirr: 20.2 },
      ],
      { windows: 128 },
    );
    expect(pickAnswer(fund, window3to12).date).toBe(8);
  });

  it("measures the edge against the middle of the window, which the answer can sit below", () => {
    // Ten dates rated 1 through 10, so the median is 5.5. The date that ranked best across
    // rolling windows is the one rated 3, and saying so honestly means a negative edge.
    const fund = fundWith(
      window3to12.map((d, index) => ({
        d,
        xirr: index + 1,
        meanPct: d === 5 ? 99 : 10,
        topQ: 0.25,
      })),
    );
    const answer = pickAnswer(fund, window3to12);
    expect(answer.date).toBe(5);
    expect(answer.edgePp).toBe(-2.5);
  });

  it("rounds the edge to the 3 dp the pipeline stores XIRR at, dropping the float noise", () => {
    // Kotak's window 3-12: the 12th at 20.319 against a median of 20.288, which in binary
    // floating point subtracts to 0.031000000000000583.
    expect(pickAnswer(kotak, window3to12).edgePp).toBe(0.031);
  });

  it("hands back the artifact row for the date it names, so callers never re-search the fund", () => {
    const answer = pickAnswer(kotak, window3to12);
    expect(answer.result.d).toBe(answer.date);
    expect(answer.result).toBe(kotak.dates[answer.date - 1]);
  });

  it("refuses to answer at all rather than naming a date from outside the window", () => {
    const fund = fundWith([]);
    expect(() => pickAnswer(fund, [])).toThrow(/no dates in the window/i);
  });
});

describe("pickAnswer against the published Kotak artifact", () => {
  const salaries: Salary[] = ["last", ...Array.from({ length: 31 }, (_, index) => index + 1)];

  it("names a date inside the window for every salary day and buffer there is", () => {
    // The non-negotiable, checked over all 256 states the URL can hold: a date outside the
    // window is one the user's salary hasn't arrived for.
    for (const salary of salaries) {
      for (let buffer = 0; buffer <= MAX_BUFFER; buffer++) {
        const window = safeWindow({ salary, buffer });
        expect(window).toHaveLength(WINDOW_LENGTH);

        const answer = pickAnswer(kotak, window);
        expect(window).toContain(answer.date);
        expect(answer.result.d).toBe(answer.date);
        expect(Number.isFinite(answer.edgePp)).toBe(true);
      }
    }
  });

  it("moves the answer when the salary day moves, which is acceptance criterion 4", () => {
    const onDefaults = pickAnswer(kotak, safeWindow(DEFAULT_PARAMS));
    const onThe15th = pickAnswer(kotak, safeWindow({ salary: 15, buffer: DEFAULT_BUFFER }));

    expect(onDefaults.date).not.toBe(onThe15th.date);
    // Each answer belongs to its own window, not merely to a different number.
    expect(safeWindow(DEFAULT_PARAMS)).toContain(onDefaults.date);
    expect(safeWindow({ salary: 15, buffer: DEFAULT_BUFFER })).toContain(onThe15th.date);
    // PLAN.md §4 names both dates for this fixture. Asserting only that they differ would pass
    // for any engine that moved the answer at all, including one that moved it wrongly.
    expect(onDefaults.date).toBe(12);
    expect(onThe15th.date).toBe(25);
  });

  it("ranks by average percentile before top-quartile share, the order §6.4 pins", () => {
    // The 5th has the better average rank, the 6th the better quartile share. §6.4 puts meanPct
    // first; without this case the two comparators could be swapped and every other test passes.
    const fund = fundWith([
      { d: 5, meanPct: 80, topQ: 0.1 },
      { d: 6, meanPct: 70, topQ: 0.9 },
    ]);

    expect(pickAnswer(fund, safeWindow(DEFAULT_PARAMS)).date).toBe(5);
  });

  it("won't rank on percentiles a fund with no rolling windows shouldn't have", () => {
    // `windows: 0` means the pipeline measured no rolling statistics, so percentiles on such an
    // artifact describe nothing and XIRR is all there is to order by. This is what the
    // `fund.windows > 0` half of the mode gate is for; the null check alone wouldn't catch it.
    const fund = fundWith(
      [
        { d: 5, meanPct: 90, topQ: 0.9, xirr: 19 },
        { d: 6, meanPct: 10, topQ: 0.1, xirr: 21 },
      ],
      { windows: 0 },
    );

    expect(pickAnswer(fund, safeWindow(DEFAULT_PARAMS)).date).toBe(6);
  });
});

describe("windowEdges", () => {
  it("covers the window's dates and says nothing about any other", () => {
    const dates = safeWindow(DEFAULT_PARAMS);
    const edges = windowEdges(kotak, dates);

    expect([...edges.keys()].sort((a, b) => a - b)).toEqual([...dates].sort((a, b) => a - b));
    // Dates outside the window are not choices the reader has, so the grid says nothing there.
    expect(edges.has(15)).toBe(false);
  });

  it("agrees with the answer's own edge exactly, not merely to the printed decimal", () => {
    // The grid prints this beside the marigold cell and the headline prints it in a sentence.
    // They share doubledMedian and edgeFrom, so they cannot drift; this is what pins that.
    for (const salary of ["last", 1, 15, 26, 28] as const) {
      const dates = safeWindow({ salary, buffer: DEFAULT_BUFFER });
      const answer = pickAnswer(kotak, dates);
      expect(windowEdges(kotak, dates).get(answer.date)).toBe(answer.edgePp);
    }
  });

  it("holds up on a window that wraps past the 28th", () => {
    const dates = safeWindow({ salary: 26, buffer: DEFAULT_BUFFER });
    const edges = windowEdges(kotak, dates);

    expect(dates).toContain(1);
    expect(edges.size).toBe(WINDOW_LENGTH);
    for (const date of dates) expect(edges.get(date)).toBeTypeOf("number");
  });

  it("puts the middle of the window at or near zero, since that is the baseline", () => {
    const dates = safeWindow(DEFAULT_PARAMS);
    const values = [...windowEdges(kotak, dates).values()].sort((a, b) => a - b);
    const middle = (values[4] ?? 0) + (values[5] ?? 0);

    // The two central values straddle the median, so together they cancel.
    expect(Math.abs(middle)).toBeLessThan(1e-9);
  });

  it("returns nothing rather than guessing when the artifact shares no date with the window", () => {
    expect(windowEdges({ ...kotak, dates: [] }, safeWindow(DEFAULT_PARAMS)).size).toBe(0);
  });
});
