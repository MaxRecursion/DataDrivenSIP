import { describe, expect, it } from "vitest";
import meta from "../../public/data/meta.json";
import type { DateResult, FundArtifact } from "../../shared/artifacts";
import { pickAnswer } from "./answer";
import { disclosureCopy } from "./disclosure";
const dateAt = (d: number, over: Partial<DateResult> = {}): DateResult => ({
  d,
  xirr: 12,
  corpus: 1_000_000,
  meanPct: 50,
  topQ: 0.25,
  w: 1,
  ...over,
});

const fundWith = (over: Partial<FundArtifact> = {}): FundArtifact => ({
  code: 100000,
  name: "A Fund - Direct Plan - Growth",
  house: "A Mutual Fund",
  category: "Equity Schemes - Mid Cap Fund",
  navFrom: "2013-01-03",
  navTo: "2026-09-15",
  instalments: 164,
  dates: Array.from({ length: 28 }, (_, index) => dateAt(index + 1)),
  spreadPp: 0.112,
  spreadRupees: 59476,
  stability: 0.543,
  metricsAgree: true,
  verdict: "noise",
  windows: 128,
  confidence: "full",
  instalmentLow: 9523,
  instalmentHigh: 168945,
  cohortSpreadPp: 0.064,
  ...over,
});

const copyFor = (over: Partial<FundArtifact> = {}) => {
  const fund = fundWith(over);
  return disclosureCopy(fund, pickAnswer(fund));
};

const everyLine = (copy: ReturnType<typeof disclosureCopy>) => [
  copy.chartCaption,
  ...copy.confidence,
  ...copy.matters,
];

// The published artifacts, loaded the way copy.test.ts loads them: this file belongs to the app
// project, which carries no Node types, so node:fs would not compile.
const artifacts = import.meta.glob<FundArtifact>(
  [
    "../../public/data/*/funds/119775.json",
    "../../public/data/*/funds/151713.json",
    "../../public/data/*/funds/103490.json",
    "../../public/data/*/funds/145137.json",
    "../../public/data/*/funds/151785.json",
  ],
  { eager: true, import: "default" },
);

const published = (code: number): FundArtifact => {
  const artifact = artifacts[`../../public/data/${meta.dataVersion}/funds/${code}.json`];
  if (!artifact) throw new Error(`No published artifact for ${code} at ${meta.dataVersion}`);
  return artifact;
};

const realCopy = (code: number) => {
  const fund = published(code);
  return disclosureCopy(fund, pickAnswer(fund), );
};

describe("the chart caption", () => {
  it("states what the zoomed axis is zoomed into, which is the chart's whole honesty", () => {
    expect(copyFor().chartCaption).toContain("0.11 pp of XIRR");
    expect(copyFor().chartCaption).toContain("zoomed");
  });
});

describe("the confidence section", () => {
  it("explains the stability scale before quoting a score against it", () => {
    const [stability] = copyFor({ stability: 0.72 }).confidence;
    expect(stability).toContain("−1 to 1");
    expect(stability).toContain("0.72");
    expect(stability).toContain("did repeat");
  });

  it("says out loud when the order reversed between the halves", () => {
    // 151713 scores −0.547. Calling that merely "not stable" would hide that the dates which
    // did well early did badly late, which is the sharpest evidence of noise the fund has.
    const [stability] = copyFor({ stability: -0.547 }).confidence;
    expect(stability).toContain("reversed");
    expect(stability).toContain("noise");
  });

  it("admits when stability could not be computed at all", () => {
    expect(copyFor({ stability: null }).confidence[0]).toContain("can't be checked");
  });

  it("puts this fund's spread beside what is typical for its length, which is D21's whole ask", () => {
    const line = copyFor({ spreadPp: 0.767, cohortSpreadPp: 0.478 }).confidence[1];
    expect(line).toContain("0.77 pp");
    expect(line).toContain("0.48 pp");
  });

  it("says plainly when a spread is wider than its length explains", () => {
    // The funds D21 exists for: the copy elsewhere must not explain these away.
    const line = copyFor({ spreadPp: 1.293, cohortSpreadPp: 0.342 }).confidence[1];
    expect(line).toContain("wider than");
    expect(line).toContain("doesn't account for all of it");
  });

  it("offers no comparison at all when the band is too thin to have one", () => {
    const line = copyFor({ cohortSpreadPp: null }).confidence[1];
    expect(line).toContain("too few published funds");
    expect(line).not.toContain("typical for a fund");
  });

  it("measures the answer's quartile share against the 25% chance would give it", () => {
    const fund = fundWith({ dates: Array.from({ length: 28 }, (_, i) => dateAt(i + 1, { topQ: 0.6, meanPct: i === 11 ? 99 : 10 })) });
    const line = disclosureCopy(fund, pickAnswer(fund), ).confidence[2];
    expect(line).toContain("60.0%");
    expect(line).toContain("25.0%");
  });

  it("owns up when another date led more often than the one it named", () => {
    // The pick is made on average rank, never on `w`, so these genuinely disagree — and §6.5
    // puts `w` in this very section, where a reader would catch the contradiction.
    const dates = Array.from({ length: 28 }, (_, i) =>
      dateAt(i + 1, { meanPct: i === 11 ? 99 : 50, w: i === 4 ? 40 : 1 }),
    );
    const fund = fundWith({ dates });
    const line = disclosureCopy(fund, pickAnswer(fund), ).confidence[3];

    expect(line).toContain("the 5th led 40");
    expect(line).toContain("not the same as the one that led most often");
  });

  it("reports the two measures disagreeing, since that is evidence about the fund", () => {
    const lines = copyFor({ metricsAgree: false }).confidence;
    expect(lines.some((line) => line.includes("disagree"))).toBe(true);
  });

  it("distinguishes a short history from a cut one when confidence is reduced", () => {
    const short = copyFor({ confidence: "reduced", instalments: 40 }).confidence;
    expect(short.at(-1)).toContain("40 months of history leaves too few");

    const cut = copyFor({ confidence: "reduced", trimmedFrom: "2013-04-22" }).confidence;
    expect(cut.at(-1)).toContain("cut at 22 April 2013");
    expect(cut.at(-1)).toContain("not on the fund's whole life");
  });
});

describe("what actually matters", () => {
  it("prices the date in rupees, against a typical date of the month", () => {
    const dates = Array.from({ length: 28 }, (_, i) =>
      dateAt(i + 1, { xirr: i === 11 ? 13 : 12, corpus: i === 11 ? 1_000_630 : 1_000_000 }),
    );
    const fund = fundWith({ dates });
    const [edge] = disclosureCopy(fund, pickAnswer(fund)).matters;

    expect(edge).toContain("₹630");
    expect(edge).toContain("₹16.4 lakh invested");
  });

  it("says so rather than inventing a gain when the named date ended with less", () => {
    // The date is named on its rate of return, and the highest rate does not have to be the
    // highest rupee total — an early instalment at a low NAV can outweigh it. Printing that
    // as a gain would be a straightforward lie.
    const dates = Array.from({ length: 28 }, (_, i) =>
      dateAt(i + 1, { xirr: i === 11 ? 13 : 12, corpus: i === 11 ? 999_000 : 1_000_000 }),
    );
    const fund = fundWith({ dates });
    const [edge] = disclosureCopy(fund, pickAnswer(fund)).matters;

    expect(edge).toContain("less");
    expect(edge).toContain("a rate and a rupee total can disagree");
  });

  it("never lets the average instalment stand without its range", () => {
    // D7 is explicit: an average alone reads as a guarantee.
    const missed = copyFor().matters[1];
    expect(missed).toContain("on average");
    expect(missed).toContain("₹9,523");
    expect(missed).toContain("₹1,68,945");
    expect(missed).toContain("not a promise");
  });

  it("compares this fund's own two numbers instead of asserting a universal rule", () => {
    // D7: "one bounced instalment costs more than the entire date spread" is not safe asserted
    // universally, so the page checks it here and reports what it finds.
    expect(copyFor().matters[2]).toContain("costs more than the date does");
  });

  it("closes on the one thing the arithmetic cannot know: whether the money is there", () => {
    // The page no longer asks when the reader is paid, so it cannot pick a date around it —
    // which makes saying so more important, not less.
    const timing = copyFor().matters.at(-1);
    expect(timing).toContain("funded on whichever date you pick");
    expect(timing).toContain("costs far more than any date here is worth");
  });
});

describe("copy for real published funds", () => {
  it("reads correctly for Kotak, the fund every number in the plan was checked against", () => {
    const copy = realCopy(119775);
    expect(copy.chartCaption).toContain("0.11 pp");
    expect(copy.confidence[0]).toContain("0.54");
    expect(copy.confidence[1]).toContain("0.06 pp");
  });

  it("tells a 40-month fund that its dates reversed order between the halves (151713)", () => {
    const copy = realCopy(151713);
    expect(copy.confidence[0]).toContain("reversed");
    expect(copy.confidence.at(-1)).toContain("reduced confidence");
  });

  it("offers no typical spread for a fund whose band is nearly empty (103490)", () => {
    expect(realCopy(103490).confidence[1]).toContain("too few published funds");
  });

  it("produces every line for a fund of each shape, with nothing empty or undefined", () => {
    for (const code of [119775, 151713, 103490, 145137, 151785]) {
      for (const line of everyLine(realCopy(code))) {
        expect(line.length).toBeGreaterThan(0);
        expect(line).not.toContain("undefined");
        expect(line).not.toContain("NaN");
      }
    }
  });

  it("uses no word the compliance check forbids", () => {
    // Mirrors BANNED_COPY in scripts/check-rules.ts, which skips *.test.ts files.
    const banned = /(?<![\w-])(best|recommend|saf(?:e|er|est|ely)|real advantage|winn(?:er|ers|ing)|guarantee|outperform|top[- ]perform)/i;
    for (const code of [119775, 151713, 103490, 145137, 151785]) {
      for (const line of everyLine(realCopy(code))) {
        expect(line).not.toMatch(banned);
      }
    }
  });
});
