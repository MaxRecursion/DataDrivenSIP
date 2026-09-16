import { describe, expect, it } from "vitest";
import meta from "../../public/data/meta.json";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { pickAnswer, type Answer } from "./answer";
import { answerCopy, MIN_EDGE_PP, SETTLED_INSTALMENTS, SPREAD_THRESHOLD_PP, STABILITY_THRESHOLD } from "./copy";

/** The default window: salary on the last working day, two days of buffer (PLAN.md D6). */
const WINDOW = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** A window that wraps past the 28th, which the screen-reader summary has to survive. */
const WRAPPED = [26, 27, 28, 1, 2, 3, 4, 5, 6, 7];

const dateAt = (d: number, over: Partial<DateResult> = {}): DateResult => ({
  d,
  xirr: 12,
  corpus: 1_000_000,
  meanPct: 50,
  topQ: 0.25,
  w: 4,
  ...over,
});

/**
 * Kotak's own value extremes: the 1st invests earliest and ends highest, the 20th lowest, and
 * the gap between them is the artifact's spreadRupees. The default fund carries this shape so
 * the rupee line has two different dates to name.
 */
const kotakCorpus = (d: number) => (d === 1 ? 7_396_166 : d === 20 ? 7_336_690 : 7_350_000);

/** A full-confidence noise fund, the shape most real funds have. Tests override one thing. */
const fundWith = (over: Partial<FundArtifact> = {}): FundArtifact => ({
  code: 100000,
  name: "A Fund - Direct Plan - Growth",
  house: "A Mutual Fund",
  category: "Equity Schemes - Mid Cap Fund",
  navFrom: "2013-01-03",
  navTo: "2026-09-15",
  instalments: 164,
  dates: Array.from({ length: 28 }, (_, i) => dateAt(i + 1, { corpus: kotakCorpus(i + 1) })),
  spreadPp: 0.112,
  spreadRupees: 59476,
  stability: 0.543,
  metricsAgree: true,
  verdict: "noise",
  windows: 128,
  confidence: "full",
  ...over,
});

const answerOn = (date: number, edgePp: number): Answer => ({ date, result: dateAt(date), edgePp });

const copyFor = (fund: Partial<FundArtifact>, answer: Answer, window = WINDOW) =>
  answerCopy(fundWith(fund), answer, window);

/** Every user-facing string in one place, for the checks that apply to all of them. */
const allStrings = (copy: ReturnType<typeof answerCopy>) => [
  copy.headline,
  ...copy.caveats,
  copy.rupeeLine,
  copy.srSummary,
];

// ---------------------------------------------------------------------------------------------
// Real published artifacts

/**
 * Read through Vite's glob rather than node:fs: this file belongs to the app project, which
 * deliberately carries no Node types, so a test that reaches for the filesystem doesn't compile.
 * The version directory stays a wildcard and the lookup goes through meta.json, so the next
 * pipeline run moves the data without breaking the suite.
 */
const artifacts = import.meta.glob<FundArtifact>(
  [
    "../../public/data/*/funds/119775.json",
    "../../public/data/*/funds/151713.json",
    "../../public/data/*/funds/103490.json",
    "../../public/data/*/funds/142110.json",
    "../../public/data/*/funds/145137.json",
    "../../public/data/*/funds/120497.json",
    "../../public/data/*/funds/141924.json",
    "../../public/data/*/funds/112039.json",
    "../../public/data/*/funds/118320.json",
    "../../public/data/*/funds/145206.json",
  ],
  { eager: true, import: "default" },
);

const published = (code: number): FundArtifact => {
  const artifact = artifacts[`../../public/data/${meta.dataVersion}/funds/${code}.json`];
  if (!artifact) throw new Error(`No published artifact for ${code} at ${meta.dataVersion}`);
  return artifact;
};

/**
 * The real pick rather than a re-implementation of it. answer.ts owns the choice and rounds
 * `edgePp` to the three decimals the page reads, so these cases exercise the two halves
 * composing on real data, not just this file in isolation.
 */
const realCopy = (code: number, window = WINDOW) => {
  const fund = published(code);
  return answerCopy(fund, pickAnswer(fund, window), window);
};

// ---------------------------------------------------------------------------------------------
// Headline: the D7 table

describe("the headline", () => {
  it("leads with the length of the history when confidence is reduced, whatever the verdict says", () => {
    const copy = copyFor(
      { confidence: "reduced", verdict: "marginal", instalments: 40, spreadPp: 0.767, stability: -0.547 },
      answerOn(4, 0.124),
    );
    expect(copy.headline).toBe(
      "This fund has 40 months of history, too little to tell whether the date matters. The 4th fits your window.",
    );
  });

  it("puts reduced confidence ahead of a meaningful verdict, so thin history can't be dressed up", () => {
    const copy = copyFor(
      { confidence: "reduced", verdict: "meaningful", instalments: 37, spreadPp: 0.9, stability: 0.8 },
      answerOn(7, 0.4),
    );
    expect(copy.headline).toContain("too little to tell whether the date matters");
    expect(copy.headline).not.toContain("came out ahead");
  });

  it("calls a noise verdict a tiebreak rather than inventing a reason to prefer the date", () => {
    const copy = copyFor({ verdict: "noise" }, answerOn(12, 0.031));
    expect(copy.headline).toBe(
      "Any date in your window has done about the same in this fund. The 12th is a tiebreak: across 3-year stretches it ranked a little higher on average.",
    );
  });

  it("falls back to the tiebreak line for any verdict whose edge is too small to print", () => {
    // 0.005 pp rounds away to "0.00 pp", so claiming it would be claiming a number the reader
    // cannot see. The boundary is inclusive.
    const meaningful = copyFor({ verdict: "meaningful", spreadPp: 0.3, stability: 0.7 }, answerOn(12, MIN_EDGE_PP));
    const marginal = copyFor({ verdict: "marginal", spreadPp: 0.3, stability: 0.5 }, answerOn(12, 0.001));
    expect(meaningful.headline).toContain("is a tiebreak");
    expect(marginal.headline).toContain("is a tiebreak");
  });

  it("says the spread isn't consistent when marginal came from spread alone", () => {
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.282, stability: 0.557 }, answerOn(12, 0.06));
    expect(copy.headline).toBe(
      "Dates in this fund have differed by up to 0.28 pp, but not consistently. The 12th came out slightly ahead in your window; the pattern may not hold.",
    );
  });

  it("names how little the edge is when marginal came from stability alone", () => {
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.081, stability: 0.782 }, answerOn(12, 0.024));
    expect(copy.headline).toBe(
      "The 12th has come out slightly ahead in your window fairly consistently, but by very little: 0.02 pp of XIRR.",
    );
  });

  it("states the edge and the years behind it when the verdict is meaningful", () => {
    const copy = copyFor(
      { verdict: "meaningful", spreadPp: 0.276, stability: 0.741, navFrom: "2018-02-06" },
      answerOn(12, 0.037),
    );
    expect(copy.headline).toBe(
      "In this fund the 12th has come out ahead of the other dates in your window: +0.04 pp of XIRR over 8.6 years.",
    );
  });

  it("never reads a null stability as stable, matching the engine's own rule", () => {
    // Stability is null when it can't be computed. Treating that as "above the threshold" would
    // turn an unmeasurable fund into a consistent one.
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.4, stability: null }, answerOn(12, 0.06));
    expect(copy.headline).toContain("but not consistently");
  });

  it("drops to the quietest line when an artifact disagrees with the thresholds it was graded by", () => {
    // Neither test passes, so no marginal row applies. A stale artifact must not produce a
    // headline that overclaims, and must not throw on the page either.
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.1, stability: 0.2 }, answerOn(12, 0.06));
    expect(copy.headline).toContain("is a tiebreak");
  });
});

// ---------------------------------------------------------------------------------------------
// Caveats

describe("the caveats", () => {
  const disagree =
    "The date with the highest XIRR and the date with the highest final value differ here, which points to noise.";

  it("says so when the two metrics point at different dates", () => {
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.3, metricsAgree: false }, answerOn(12, 0.06));
    expect(copy.caveats).toContain(disagree);
  });

  it("leaves that line out on a noise verdict, which has already said it", () => {
    const copy = copyFor({ verdict: "noise", metricsAgree: false }, answerOn(12, 0.031));
    expect(copy.caveats).not.toContain(disagree);
  });

  it("warns that a short history produces this spread on its own (D21)", () => {
    const copy = copyFor(
      { verdict: "meaningful", instalments: 94, spreadPp: 0.3, stability: 0.712 },
      answerOn(12, 0.0775),
    );
    expect(copy.caveats).toContain(
      "This fund has 94 months of history, fewer than eight years. A spread of 0.30 pp is hard to tell apart from the noise a history this short produces, so this verdict reflects the length of the history as much as the fund.",
    );
  });

  it("stops warning about history length at eight years of instalments", () => {
    const short = copyFor({ verdict: "meaningful", instalments: SETTLED_INSTALMENTS - 1 }, answerOn(12, 0.06));
    const settled = copyFor({ verdict: "meaningful", instalments: SETTLED_INSTALMENTS }, answerOn(12, 0.06));
    expect(short.caveats.some((line) => line.includes("fewer than eight years"))).toBe(true);
    expect(settled.caveats.some((line) => line.includes("fewer than eight years"))).toBe(false);
  });

  it("doesn't blame history length for a noise verdict, which claimed nothing to begin with", () => {
    const copy = copyFor({ verdict: "noise", instalments: 40 }, answerOn(12, 0.031));
    expect(copy.caveats).toEqual([]);
  });

  it("admits when the published history starts later than the fund's own first NAV", () => {
    const copy = copyFor({ trimmedFrom: "2013-04-22", navFrom: "2013-04-22" }, answerOn(12, 0.031));
    expect(copy.caveats).toEqual([
      "The published history starts on 22 April 2013, where a re-denomination or a gap months long cut the series. Everything before that is missing, so this is not the fund's whole life.",
    ]);
  });

  it("stacks all three in a fixed order, so the page never reshuffles its own hedges", () => {
    const copy = copyFor(
      {
        verdict: "marginal",
        spreadPp: 0.3,
        instalments: 40,
        metricsAgree: false,
        trimmedFrom: "2013-04-22",
        navFrom: "2013-04-22",
      },
      answerOn(12, 0.06),
    );
    expect(copy.caveats).toHaveLength(3);
    expect(copy.caveats[0]).toContain("highest XIRR");
    expect(copy.caveats[1]).toContain("fewer than eight years");
    expect(copy.caveats[2]).toContain("published history starts on");
  });

  it("has nothing to add when the fund agrees with itself and has history behind it", () => {
    expect(copyFor({ verdict: "meaningful", spreadPp: 0.3, stability: 0.7 }, answerOn(12, 0.06)).caveats).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Rupee line (D1)

describe("the rupee line", () => {
  it("names the value extremes, not the XIRR extremes, because rupees are what it reports", () => {
    // The 26th wins on XIRR and the 5th on final value. D1 says the line compares final values.
    const dates = Array.from({ length: 28 }, (_, i) => dateAt(i + 1));
    const copy = copyFor(
      {
        dates: dates.map((date) => {
          if (date.d === 5) return { ...date, corpus: 1_100_000 };
          if (date.d === 9) return { ...date, corpus: 900_000 };
          if (date.d === 26) return { ...date, xirr: 99 };
          return date;
        }),
      },
      answerOn(12, 0.031),
    );
    expect(copy.rupeeLine).toContain("(the 5th and 9th)");
    expect(copy.rupeeLine).not.toContain("26th");
  });

  it("reads as one sentence with the notional amount, the base and the span all stated", () => {
    const copy = copyFor({}, answerOn(12, 0.031));
    expect(copy.rupeeLine).toBe(
      "For a notional ₹10,000 monthly SIP, the highest- and lowest-value dates (the 1st and 20th) ended ₹59,476 apart on ₹16.4 lakh invested, 0.8% of final value, over 13.7 years.",
    );
  });

  it("takes the percentage against the highest corpus, which is the base D1 fixes", () => {
    const dates = Array.from({ length: 28 }, (_, i) => dateAt(i + 1, i === 0 ? { corpus: 2_000_000 } : {}));
    const copy = copyFor({ dates, spreadRupees: 1_000_000 }, answerOn(12, 0.031));
    // 10,00,000 of 20,00,000, not of the lowest corpus.
    expect(copy.rupeeLine).toContain("50.0% of final value");
  });

  it("is shown whatever the verdict, since the rupee gap is a fact about the fund", () => {
    for (const verdict of ["noise", "marginal", "meaningful"] as const) {
      expect(copyFor({ verdict }, answerOn(12, 0.06)).rupeeLine).toContain("For a notional ₹10,000 monthly SIP");
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Screen-reader summary (PLAN.md 6.6)

describe("the screen-reader summary", () => {
  it("gives the window's ends and the answer, which is what the grid shows visually", () => {
    expect(copyFor({}, answerOn(12, 0.031)).srSummary).toBe("Your window: 3rd to 12th. Your date: the 12th.");
  });

  it("reads a wrapped window in window order, not in numeric order", () => {
    // The window runs 26, 27, 28, 1 ... 7. "26th to 28th" would describe a different window.
    expect(copyFor({}, answerOn(2, 0.031), WRAPPED).srSummary).toBe("Your window: 26th to 7th. Your date: the 2nd.");
  });
});

// ---------------------------------------------------------------------------------------------
// Real published artifacts

describe("copy for real published funds", () => {
  it("calls Kotak Mid Cap a tiebreak, because 0.112 pp across 164 months is noise", () => {
    const copy = realCopy(119775);
    expect(copy.headline).toBe(
      "Any date in your window has done about the same in this fund. The 12th is a tiebreak: across 3-year stretches it ranked a little higher on average.",
    );
    // Its metrics disagree, but a noise verdict has already said everything that implies.
    expect(copy.caveats).toEqual([]);
    expect(copy.rupeeLine).toBe(
      "For a notional ₹10,000 monthly SIP, the highest- and lowest-value dates (the 1st and 20th) ended ₹59,476 apart on ₹16.4 lakh invested, 0.8% of final value, over 13.7 years.",
    );
    expect(copy.srSummary).toBe("Your window: 3rd to 12th. Your date: the 12th.");
  });

  it("tells a 40-month fund's reader the history is too short, not that a date won (151713)", () => {
    const copy = realCopy(151713);
    expect(copy.headline).toBe(
      "This fund has 40 months of history, too little to tell whether the date matters. The 4th fits your window.",
    );
    // D21 keeps its caveat on every non-noise fund under eight years, this one included: the
    // sentence exists to defuse the 0.767 pp spread, not to report the month count. Because the
    // headline already gave the length, only the opening clause drops — the spread figure and
    // the explanation stay, which is what makes this page's "1.1% of final value" readable.
    expect(copy.caveats).toEqual([
      "The date with the highest XIRR and the date with the highest final value differ here, which points to noise.",
      "A spread of 0.77 pp is hard to tell apart from the noise a history this short produces, so this verdict reflects the length of the history as much as the fund.",
    ]);
    // What must not come back is the duplicated month count, not the caveat itself.
    expect(copy.caveats.join(" ")).not.toContain("40 months of history, fewer than eight years");
    expect(copy.rupeeLine).toBe(
      "For a notional ₹10,000 monthly SIP, the highest- and lowest-value dates (the 1st and 27th) ended ₹4,954 apart on ₹4.0 lakh invested, 1.1% of final value, over 3.3 years.",
    );
  });

  it("reports Quantum Value's 20 years as consistent but tiny (103490, marginal on stability)", () => {
    const copy = realCopy(103490);
    expect(copy.headline).toBe(
      "The 12th has come out slightly ahead in your window fairly consistently, but by very little: 0.02 pp of XIRR.",
    );
    expect(copy.caveats).toEqual([
      "The date with the highest XIRR and the date with the highest final value differ here, which points to noise.",
    ]);
    expect(copy.rupeeLine).toContain("(the 11th and 27th)");
    // 245 instalments over twelve, not the NAV span: ₹10,000 a month for the span this sentence
    // states has to come to the amount it states, and the two spans differ for 457 funds.
    expect(copy.rupeeLine).toContain("over 20.4 years");
    // The gap between the two rows named, which the independently rounded spreadRupees is not.
    expect(copy.rupeeLine).toContain("₹36,661");
  });

  it("states the edge for the one real meaningful fund with nothing to hedge (142110)", () => {
    const copy = realCopy(142110);
    expect(copy.headline).toBe(
      "In this fund the 12th has come out ahead of the other dates in your window: +0.04 pp of XIRR over 8.6 years.",
    );
    // 103 instalments and metrics that agree: the only real fund here with no caveat at all.
    expect(copy.caveats).toEqual([]);
  });

  it("hedges the meaningful verdict of a 94-month fund, which is the whole point of D21 (145137)", () => {
    const copy = realCopy(145137);
    expect(copy.headline).toBe(
      "In this fund the 12th has come out ahead of the other dates in your window: +0.08 pp of XIRR over 7.9 years.",
    );
    expect(copy.caveats).toEqual([
      "The date with the highest XIRR and the date with the highest final value differ here, which points to noise.",
      "This fund has 94 months of history, fewer than eight years. A spread of 0.30 pp is hard to tell apart from the noise a history this short produces, so this verdict reflects the length of the history as much as the fund.",
    ]);
  });

  it("owns up to the cut series on a trimmed fund (120497)", () => {
    const copy = realCopy(120497);
    expect(copy.caveats).toContain(
      "The published history starts on 22 April 2013, where a re-denomination or a gap months long cut the series. Everything before that is missing, so this is not the fund's whole life.",
    );
    // D7's reduced row was written for short histories, but D21 made every trimmed fund reduced
    // however long it is. This one keeps 160 months — over thirteen years — so the headline says
    // what is actually missing instead of calling thirteen years too little history.
    expect(copy.headline).toBe(
      "Part of this fund's history couldn't be used, so this reads on 160 months rather than the fund's whole life. The 11th fits your window.",
    );
    expect(copy.headline).not.toContain("too little to tell");
  });

  it("produces every line for a fund of each verdict and confidence, with nothing left empty", () => {
    for (const code of [119775, 151713, 103490, 142110, 145137, 120497]) {
      const copy = realCopy(code);
      for (const line of allStrings(copy)) {
        expect(line.length).toBeGreaterThan(0);
        expect(line).not.toContain("undefined");
        expect(line).not.toContain("NaN");
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The thresholds this file mirrors

describe("the mirrored thresholds", () => {
  /** pipeline/analysis/verdict.ts, rewritten against the copies exported from copy.ts. */
  const verdictFrom = (spreadPp: number, stability: number | null) => {
    const wideSpread = spreadPp > SPREAD_THRESHOLD_PP;
    const stable = stability !== null && stability > STABILITY_THRESHOLD;
    if (wideSpread && stable) return "meaningful";
    return wideSpread || stable ? "marginal" : "noise";
  };

  it("still reproduce the verdict every published fund was graded with", () => {
    // If the pipeline's thresholds ever move, this fails here rather than silently putting the
    // wrong D7 row on the page.
    for (const code of [119775, 151713, 103490, 142110, 145137, 120497, 141924, 112039, 118320, 145206]) {
      const fund = published(code);
      expect(verdictFrom(fund.spreadPp, fund.stability), `fund ${code}`).toBe(fund.verdict);
    }
  });

  it("sit either side of the real funds that only just clear them", () => {
    // 141924 is marginal on spread alone at 0.26 pp; 118320 on stability alone at 0.668.
    expect(published(141924).spreadPp).toBeGreaterThan(SPREAD_THRESHOLD_PP);
    expect(published(141924).stability).toBeLessThan(STABILITY_THRESHOLD);
    expect(published(118320).spreadPp).toBeLessThan(SPREAD_THRESHOLD_PP);
    expect(published(118320).stability).toBeGreaterThan(STABILITY_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------------------------
// Words the page may never use

describe("the words this page can't use", () => {
  /**
   * Mirrors BANNED_COPY in scripts/check-rules.ts, which is the rule CI enforces over src/**.
   * That check reads the source; this one reads what the source actually produced, so an
   * interpolated fund name or a new branch can't smuggle one of these onto the page.
   */
  const BANNED: ReadonlyArray<readonly [string, RegExp]> = [
    ["best", /(?<![\w-])best(?![\w-])/i],
    ["recommend", /(?<![\w-])recommend/i],
    ["safe", /(?<![\w-])saf(?:e|er|est|ely)(?![\w-])/i],
    ["real advantage", /(?<![\w-])real advantage(?![\w-])/i],
    ["winner", /(?<![\w-])winn(?:er|ers|ing)(?![\w-])/i],
    ["guarantee", /(?<![\w-])guarantee/i],
    ["outperform", /(?<![\w-])outperform/i],
    ["top performing", /(?<![\w-])top[- ]perform/i],
  ];

  const offences = (text: string) => BANNED.filter(([, pattern]) => pattern.test(text)).map(([word]) => word);

  it("stays out of every line produced for a real fund, in both a plain and a wrapped window", () => {
    for (const code of [119775, 151713, 103490, 142110, 145137, 120497]) {
      for (const window of [WINDOW, WRAPPED]) {
        for (const line of allStrings(realCopy(code, window))) {
          expect(offences(line), line).toEqual([]);
        }
      }
    }
  });

  it("stays out of every branch of the table, including the ones real data doesn't reach", () => {
    const cases: Array<[Partial<FundArtifact>, Answer]> = [
      [{ confidence: "reduced", verdict: "marginal", instalments: 37 }, answerOn(4, 0.12)],
      [{ verdict: "noise" }, answerOn(12, 0.031)],
      [{ verdict: "marginal", spreadPp: 0.4, stability: 0.3 }, answerOn(12, 0.06)],
      [{ verdict: "marginal", spreadPp: 0.1, stability: 0.8 }, answerOn(12, 0.02)],
      [{ verdict: "meaningful", spreadPp: 0.4, stability: 0.8 }, answerOn(12, 0.4)],
      [{ verdict: "meaningful", instalments: 40, metricsAgree: false, trimmedFrom: "2013-04-22" }, answerOn(12, 0.4)],
    ];
    for (const [fund, answer] of cases) {
      for (const line of allStrings(copyFor(fund, answer))) {
        expect(offences(line), line).toEqual([]);
      }
    }
  });

  it("says 'your window' rather than naming the window after its own safety", () => {
    // The symbol is safeWindow; the copy never borrows that word, which next to investing reads
    // as a promise about risk.
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.3 }, answerOn(12, 0.06));
    expect(copy.headline).toContain("your window");
    expect(offences(allStrings(copy).join(" "))).toEqual([]);
  });
});
