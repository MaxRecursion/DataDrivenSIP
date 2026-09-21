import { describe, expect, it } from "vitest";
import meta from "../../public/data/meta.json";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { pickAnswer, type Answer } from "./answer";
import { answerCopy, MIN_EDGE_PP, SETTLED_INSTALMENTS, SPREAD_THRESHOLD_PP, STABILITY_THRESHOLD } from "./copy";
import { formatNavDate, formatPp, formatYearsOfMonths } from "./format";

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
  // Kotak's real figures (PLAN.md D7): one ₹10,000 instalment is worth between these today,
  // and 0.062 pp is the typical spread among funds with this much history.
  instalmentLow: 9_856,
  instalmentHigh: 161_228,
  cohortSpreadPp: 0.062,
  ...over,
});

const answerOn = (date: number, edgePp: number): Answer => ({ date, result: dateAt(date), edgePp });

const copyFor = (fund: Partial<FundArtifact>, answer: Answer) => answerCopy(fundWith(fund), answer);

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
const realCopy = (code: number) => {
  const fund = published(code);
  return answerCopy(fund, pickAnswer(fund));
};

// ---------------------------------------------------------------------------------------------
// Headline

describe("the headline", () => {
  it("leads with the length of the history when there is too little of it, whatever the verdict", () => {
    // `windows`, not `confidence`, is what selects this row: D21 made every trimmed fund reduced
    // however long it is, and a fund with thirteen years of history must not be told it has too
    // little. Five windows on 40 months is what the engine actually produces for such a fund.
    const copy = copyFor(
      { confidence: "reduced", verdict: "marginal", instalments: 40, windows: 5, spreadPp: 0.767, stability: -0.547 },
      answerOn(4, 0.124),
    );
    expect(copy.headline).toBe(
      "The 4th had the highest full-history XIRR for this fund. But 40 months of history is too little to tell whether the date matters at all.",
    );
  });

  it("puts a thin history ahead of a meaningful verdict, so it can't be dressed up", () => {
    const copy = copyFor(
      { confidence: "reduced", verdict: "meaningful", instalments: 37, windows: 1, spreadPp: 0.9, stability: 0.8 },
      answerOn(7, 0.4),
    );
    expect(copy.headline).toContain("too little to tell whether the date matters");
    expect(copy.headline).not.toContain("above the middle of the month");
  });

  it("says which of the two is wrong when a fund is both cut short and short to begin with", () => {
    // No published fund is both, so only a synthetic case keeps this row honest. "Too little
    // history" would be true here but would hide that some of it was thrown away.
    const copy = copyFor(
      { confidence: "reduced", verdict: "marginal", instalments: 38, windows: 2, trimmedFrom: "2023-04-22" },
      answerOn(7, 0.4),
    );
    expect(copy.headline).toBe(
      "The 7th had the highest full-history XIRR for this fund. Part of its history couldn't be used, so that reads on 38 months rather than the fund's whole life.",
    );
  });

  it("calls a noise verdict noise rather than inventing a reason to prefer the date", () => {
    const copy = copyFor({ verdict: "noise" }, answerOn(12, 0.031));
    expect(copy.headline).toBe(
      "The 12th had the highest full-history XIRR for this fund. The 28 dates sit close enough together that the difference between them is noise rather than a date effect.",
    );
  });

  it("falls back to the noise line for any verdict whose edge is too small to print", () => {
    // 0.005 pp rounds away to "0.00 pp", so claiming it would be claiming a number the reader
    // cannot see. The boundary is inclusive.
    const meaningful = copyFor({ verdict: "meaningful", spreadPp: 0.3, stability: 0.7 }, answerOn(12, MIN_EDGE_PP));
    const marginal = copyFor({ verdict: "marginal", spreadPp: 0.3, stability: 0.5 }, answerOn(12, 0.001));
    expect(meaningful.headline).toContain("is noise rather than a date effect");
    expect(marginal.headline).toContain("is noise rather than a date effect");
  });

  it("says the spread isn't consistent when marginal came from spread alone", () => {
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.282, stability: 0.557 }, answerOn(12, 0.06));
    expect(copy.headline).toBe(
      "The 12th had the highest full-history XIRR for this fund. Dates in this fund have differed by up to 0.28 pp, but not consistently, so the pattern may not hold.",
    );
  });

  it("names how little the edge is when marginal came from stability alone", () => {
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.081, stability: 0.782 }, answerOn(12, 0.024));
    expect(copy.headline).toBe(
      "The 12th had the highest full-history XIRR for this fund. The same dates kept doing well across the history, but by very little: 0.02 pp above the middle of the month.",
    );
  });

  it("states the edge and the years behind it when the verdict is meaningful", () => {
    const copy = copyFor(
      { verdict: "meaningful", spreadPp: 0.276, stability: 0.741, navFrom: "2018-02-06" },
      answerOn(12, 0.037),
    );
    expect(copy.headline).toBe(
      "The 12th had the highest full-history XIRR for this fund. It sits 0.04 pp above the middle of the month, over 8.6 years.",
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
    expect(copy.headline).toContain("is noise rather than a date effect");
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
      "For a notional ₹10,000 monthly SIP, the highest- and lowest-value dates (the 1st and 20th) ended ₹59,476 apart on ₹16.4 lakh invested, 0.8% of the ₹74.0 lakh it grew to, over 13.7 years.",
    );
  });

  it("takes the percentage against the highest corpus, which is the base D1 fixes", () => {
    const dates = Array.from({ length: 28 }, (_, i) => dateAt(i + 1, i === 0 ? { corpus: 2_000_000 } : {}));
    const copy = copyFor({ dates, spreadRupees: 1_000_000 }, answerOn(12, 0.031));
    // 10,00,000 of 20,00,000, not of the lowest corpus — and the base is named, so a reader can
    // check the division instead of taking "of final value" on trust.
    expect(copy.rupeeLine).toContain("50.0% of the ₹20.0 lakh it grew to");
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
  it("names the day, which is the whole of what the grid shows visually", () => {
    expect(copyFor({}, answerOn(6, 0.031)).srSummary).toBe("Best SIP day: the 6th.");
  });

  it("says the same thing whatever the verdict is, because the grid does too", () => {
    // The summary stands in for the calendar, not for the headline: the caveats are read out
    // separately, and a reader who hears the grid twice over learns nothing the second time.
    for (const verdict of ["noise", "marginal", "meaningful"] as const) {
      expect(copyFor({ verdict }, answerOn(21, 0.4)).srSummary).toBe("Best SIP day: the 21st.");
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Real published artifacts

/**
 * The highest-XIRR date, computed the same way pickAnswer does (earliest on a tie) — so the
 * assertions below check that the headline names the fund's own true best date, not a number
 * copied from one night's data. A live artifact's XIRR figures move by a hundredth of a point
 * most nights; a test that hardcodes them breaks on schedule, whether or not the code is right.
 */
function highestXirrDate(fund: FundArtifact): number {
  return fund.dates.reduce((best, row) => (row.xirr > best.xirr ? row : best)).d;
}

/** Mirrors corpusExtremes in copy.ts: the two rows the rupee line actually names. */
function corpusExtremes(fund: FundArtifact): { highest: DateResult; lowest: DateResult } {
  let highest = fund.dates[0]!;
  let lowest = highest;
  for (const date of fund.dates) {
    if (date.corpus > highest.corpus) highest = date;
    if (date.corpus < lowest.corpus) lowest = date;
  }
  return { highest, lowest };
}

const nth = (d: number) => {
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix}`;
};

describe("copy for real published funds", () => {
  /**
   * One case per shape the D7-style headline table can produce, matched to a real fund known
   * to sit in that branch as of Phase 0 research. Each assertion is a relationship the artifact
   * itself proves (the named date really is the highest, the rupee gap really is the two rows'
   * difference, the caveat really names this fund's own month count) rather than a string
   * copied from a snapshot — so a real nightly NAV refresh, which moves these funds' numbers by
   * a hundredth of a point most nights, can't break a passing test on its own.
   */
  it("names Kotak Mid Cap's own highest date, whichever one that currently is (119775, noise)", () => {
    const fund = published(119775);
    const copy = realCopy(119775);
    const best = highestXirrDate(fund);

    expect(copy.headline).toContain(`The ${nth(best)} had the highest full-history XIRR`);
    expect(copy.srSummary).toBe(`Best SIP day: the ${nth(best)}.`);

    if (fund.verdict === "noise") {
      expect(copy.headline).toContain("noise rather than a date effect");
      expect(copy.caveats).toEqual([]);
    }

    const { highest, lowest } = corpusExtremes(fund);
    const gap = highest.corpus - lowest.corpus;
    expect(copy.rupeeLine).toContain(`(the ${nth(highest.d)} and ${nth(lowest.d)})`);
    expect(copy.rupeeLine).toContain(gap.toLocaleString("en-IN"));
  });

  it("tells a 40-month fund's reader the history is too short, not that a date won (151713)", () => {
    const fund = published(151713);
    const copy = realCopy(151713);
    const best = highestXirrDate(fund);

    // Criterion 5: this is the shortest fund the planner covers, and always reads on its month
    // count rather than naming a date effect, whatever the current spread happens to be.
    expect(fund.windows).toBeLessThan(24);
    expect(copy.headline).toContain(`The ${nth(best)} had the highest full-history XIRR`);
    expect(copy.headline).toContain(`${fund.instalments} months of history is too little`);

    // D21: the caveat exists to defuse the spread, not to report the month count a second time
    // now that the headline already gave it — so the duplicated phrasing must not come back.
    expect(copy.caveats.join(" ")).not.toContain(`${fund.instalments} months of history, fewer than eight years`);
    if (!fund.metricsAgree) {
      expect(copy.caveats[0]).toContain("points to noise");
    }
  });

  it("reports a fund whose spread comes from stability rather than magnitude (103490)", () => {
    const fund = published(103490);
    const copy = realCopy(103490);
    const { highest, lowest } = corpusExtremes(fund);

    expect(copy.headline).toContain(`The ${nth(highestXirrDate(fund))} had the highest full-history XIRR`);
    expect(copy.rupeeLine).toContain(`(the ${nth(highest.d)} and ${nth(lowest.d)})`);
    // 245 instalments over twelve, not the NAV span: the rupee line's own stated years has to
    // match what that many ₹10,000 instalments actually cover, not the fund's NAV history.
    expect(copy.rupeeLine).toContain(formatYearsOfMonths(fund.instalments));
  });

  it("states the edge for a real meaningful fund with metrics that agree (142110)", () => {
    const fund = published(142110);
    const copy = realCopy(142110);
    expect(fund.verdict).toBe("meaningful");
    expect(fund.metricsAgree).toBe(true);
    expect(fund.instalments).toBeGreaterThanOrEqual(SETTLED_INSTALMENTS);

    expect(copy.headline).toContain(`The ${nth(highestXirrDate(fund))} had the highest full-history XIRR`);
    expect(copy.headline).toContain("above the middle of the month");
    // Nothing to hedge: a settled history and metrics that agree leave no caveat at all.
    expect(copy.caveats).toEqual([]);
  });

  it("hedges the meaningful verdict of a fund under eight years, which is the whole point of D21 (145137)", () => {
    const fund = published(145137);
    const copy = realCopy(145137);
    expect(fund.verdict).toBe("meaningful");
    expect(fund.instalments).toBeLessThan(SETTLED_INSTALMENTS);

    expect(copy.headline).toContain(`The ${nth(highestXirrDate(fund))} had the highest full-history XIRR`);
    expect(copy.caveats.join(" ")).toContain(`${fund.instalments} months of history, fewer than eight years`);
    expect(copy.caveats.join(" ")).toContain(formatPp(fund.spreadPp));
  });

  it("owns up to the cut series on a trimmed fund, without also calling it too short (120497)", () => {
    const fund = published(120497);
    const copy = realCopy(120497);
    expect(fund.trimmedFrom).toBeDefined();
    // 160-odd months and well over MIN_WINDOWS is not a short history, so the headline must not
    // withhold the verdict — only the caveat below carries the scope warning.
    expect(fund.windows).toBeGreaterThanOrEqual(24);

    expect(copy.caveats.join(" ")).toContain(formatNavDate(fund.trimmedFrom!));
    expect(copy.caveats.join(" ")).toContain("not the fund's whole life");
    expect(copy.headline).not.toContain("too little to tell");
    expect(copy.headline).not.toContain("couldn't be used");
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

  /**
   * "Best" left the banned list when the product became "the best day of the month". It is still
   * forbidden of a fund — there is no ranking of funds anywhere — so the phrases that may carry
   * it are named rather than the word being let go entirely.
   */
  const ALLOWED = ["Best SIP day", "Best day", "best day of the month"];

  const offences = (text: string) => {
    let copy = text;
    for (const allowed of ALLOWED) copy = copy.split(allowed).join(" ");
    return BANNED.filter(([, pattern]) => pattern.test(copy)).map(([word]) => word);
  };

  it("stays out of every line produced for a real fund", () => {
    for (const code of [119775, 151713, 103490, 142110, 145137, 120497]) {
      for (const line of allStrings(realCopy(code))) {
        expect(offences(line), line).toEqual([]);
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

  it("never says 'safe', which next to investing reads as a promise about risk", () => {
    const copy = copyFor({ verdict: "marginal", spreadPp: 0.3 }, answerOn(12, 0.06));
    expect(offences(allStrings(copy).join(" "))).toEqual([]);
  });

  it("calls only the day the best one, never the fund", () => {
    // "Best" is the product's own word now, and the line between the two readings is the whole
    // no-ranking rule: a best day inside one fund is a fact, a best fund is a recommendation.
    for (const code of [119775, 151713, 103490, 142110, 145137, 120497]) {
      for (const line of allStrings(realCopy(code))) {
        expect(line, line).not.toMatch(/best (fund|scheme|performing|plan)/i);
      }
    }
  });
});
