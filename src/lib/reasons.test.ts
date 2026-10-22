import { describe, expect, it } from "vitest";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { pickAnswer } from "./answer";
import { answerCopy, SPREAD_THRESHOLD_PP, STABILITY_THRESHOLD } from "./copy";
import { reasonTiles } from "./reasons";

const dateAt = (d: number, over: Partial<DateResult> = {}): DateResult => ({
  d,
  xirr: 20,
  corpus: 1_000_000,
  meanPct: 50,
  topQ: 0.25,
  w: 4,
  ...over,
});

/**
 * A fund whose 28 dates run 20.000 up to 20.270, so the highest is the 28th, the lowest the
 * 1st, and the median sits in the middle where the edge can be checked against it.
 */
const fund = (over: Partial<FundArtifact> = {}): FundArtifact => ({
  code: 1,
  name: "A Fund - Direct Plan - Growth",
  house: "A House",
  category: "Equity",
  navFrom: "2013-01-03",
  navTo: "2026-09-15",
  instalments: 164,
  dates: Array.from({ length: 28 }, (_, i) => dateAt(i + 1, { xirr: 20 + i * 0.01, corpus: 1_000_000 + i * 1_000 })),
  spreadPp: 0.27,
  spreadRupees: 27_000,
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

const tilesFor = (over: Partial<FundArtifact> = {}) => {
  const f = fund(over);
  const answer = pickAnswer(f);
  return { tiles: reasonTiles(f, answer, answerCopy(f, answer)), answer, f };
};

describe("reasonTiles", () => {
  it("names three reasons, numbered in reading order", () => {
    const { tiles } = tilesFor();
    expect(tiles.map((t) => t.n)).toEqual([1, 2, 3]);
    expect(tiles.map((t) => t.title)).toEqual([
      "Highest return of all 28 dates",
      "How far apart the 28 dates are",
      "What the spread is worth",
    ]);
  });

  it("prints the named date's own XIRR, and its distance from the median", () => {
    const { tiles, answer } = tilesFor();
    expect(tiles[0]!.figure).toBe("20.270%");
    // The 28 run 20.000..20.270, so the median is the mean of the 14th and 15th: 20.135.
    expect(answer.medianXirr).toBeCloseTo(20.135, 10);
    expect(tiles[0]!.sub).toBe("Full-history XIRR, 0.14 pp above the middle of the month (20.135%).");
  });

  it("carries the spread with the extremes that produced it", () => {
    const { tiles, f } = tilesFor();
    expect(tiles[1]!.figure).toBe("0.27 pp");
    expect(tiles[1]!.sub).toContain("From the 1st (20.000%) up to the 28th.");
    expect(f.spreadPp).toBe(0.27);
  });

  it("counts the rupee tile up, and leaves the other two still", () => {
    const { tiles } = tilesFor();
    expect(tiles[0]!.ticker).toBeUndefined();
    expect(tiles[1]!.ticker).toBeUndefined();
    expect(tiles[2]!.ticker).toEqual({ value: 27_000 });
    expect(tiles[2]!.figure).toContain("₹");
  });

  it("builds the rupee sub-line from the same parts as the sentence", () => {
    const f = fund();
    const answer = pickAnswer(f);
    const copy = answerCopy(f, answer);
    const [, , worth] = reasonTiles(f, answer, copy);
    expect(worth!.sub).toContain(copy.rupeeParts.pair);
    expect(worth!.sub).toContain(copy.rupeeParts.grewTo);
    expect(worth!.sub).toContain(copy.rupeeParts.years);
    /*
     * The tile and the sentence must name the same two dates. They word the pair slightly
     * differently — the sentence elides the second article, "(the 28th and 1st)" — so this
     * compares the ordinals rather than the phrasing, which is the part that would be a lie
     * if the two drifted.
     */
    const ordinals = (text: string) => text.match(/\d+(?:st|nd|rd|th)/g);
    expect(copy.rupeeParts.pair).toBe("the 28th and the 1st");
    expect(ordinals(copy.rupeeParts.pair)).toEqual(["28th", "1st"]);
    expect(ordinals(copy.rupeeBefore)).toEqual(["28th", "1st"]);
  });
});

/**
 * The second tile explains the verdict rather than restating it, so each branch has to match
 * the test the verdict actually applied. These assert the branch, and that the two frozen
 * thresholds are quoted rather than hardcoded a second time.
 */
describe("the spread's verdict, in words", () => {
  const sub = (over: Partial<FundArtifact>) => tilesFor(over).tiles[1]!.sub;

  it("says both tests passed when the spread is wide and the order held", () => {
    const text = sub({ spreadPp: 0.4, stability: 0.8, verdict: "meaningful" });
    expect(text).toContain("Wider than the 0.25 pp a date effect needs, and the order of dates held");
    expect(text).toContain("(0.80, above 0.6)");
  });

  it("says which one failed when the spread is wide but the order did not hold", () => {
    const text = sub({ spreadPp: 0.4, stability: 0.2, verdict: "marginal" });
    expect(text).toContain("but the order of dates didn't hold (0.20, needs 0.6)");
  });

  it("says which one passed when the order held but the spread is narrow", () => {
    const text = sub({ spreadPp: 0.1, stability: 0.8, verdict: "marginal" });
    expect(text).toContain("Narrower than the 0.25 pp a date effect needs, though the order of dates held (0.80)");
  });

  it("names both shortfalls when neither test passed", () => {
    const text = sub({ spreadPp: 0.1, stability: 0.2, verdict: "noise" });
    expect(text).toContain("A date effect needs more than 0.25 pp and an order of dates that holds");
    expect(text).toContain("scored 0.20, short of 0.6");
  });

  it("says the order could not be checked at all when stability is null", () => {
    expect(sub({ spreadPp: 0.4, stability: null })).toContain(
      "Wider than the 0.25 pp a date effect needs, but there is too little variation",
    );
    expect(sub({ spreadPp: 0.1, stability: null })).toContain(
      "A date effect needs more than 0.25 pp, and there is too little variation",
    );
  });

  it("quotes the frozen thresholds rather than a second copy of them", () => {
    expect(sub({ spreadPp: 0.4, stability: 0.8 })).toContain(`${SPREAD_THRESHOLD_PP} pp`);
    expect(sub({ spreadPp: 0.4, stability: 0.8 })).toContain(String(STABILITY_THRESHOLD));
  });
});
