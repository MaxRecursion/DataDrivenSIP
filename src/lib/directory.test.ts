import { describe, expect, it } from "vitest";
import type { IndexRow } from "../../shared/artifacts";
import { buildDirectory, categorySlug, directoryCount } from "./directory";

const row = (code: number, name: string, house: string, category: string): IndexRow => [
  code,
  name,
  house,
  category,
];

describe("category slugs", () => {
  it("makes an anchor id out of a published category name", () => {
    expect(categorySlug("Equity Scheme - Value Fund")).toBe("equity-scheme-value-fund");
    expect(categorySlug("Other Scheme - FoF Domestic")).toBe("other-scheme-fof-domestic");
  });

  it("never leaves a leading or trailing separator, or an empty id", () => {
    expect(categorySlug("  - Debt -  ")).toBe("debt");
    expect(categorySlug("---")).toBe("other");
    expect(categorySlug("")).toBe("other");
  });
});

describe("the directory", () => {
  const rows = [
    row(3, "Zeta Fund", "C AMC", "Equity Scheme - Value Fund"),
    row(1, "Alpha Fund", "A AMC", "Equity Scheme - Value Fund"),
    row(2, "Beta Fund", "B AMC", "Debt Scheme - Liquid Fund"),
  ];

  it("groups by category, alphabetically, with names alphabetical inside", () => {
    const groups = buildDirectory(rows);
    expect(groups.map((group) => group.category)).toEqual([
      "Debt Scheme - Liquid Fund",
      "Equity Scheme - Value Fund",
    ]);
    expect(groups[1]?.funds.map((fund) => fund.name)).toEqual(["Alpha Fund", "Zeta Fund"]);
  });

  it("is never ordered by a metric, so it cannot become a second ranked list", () => {
    // CLAUDE.md allows exactly one ranked list in this project, the trending five. The index
    // rows carry a verdict and a spread; the directory must ignore both, and must not be
    // reorderable by passing them in a different order.
    const withMetrics: IndexRow[] = [
      [1, "Alpha Fund", "A AMC", "Equity", "meaningful", 0.9],
      [2, "Beta Fund", "B AMC", "Equity", "noise", 0.01],
    ];
    const forward = buildDirectory(withMetrics);
    const reversed = buildDirectory([...withMetrics].reverse());
    expect(forward).toEqual(reversed);
    expect(forward[0]?.funds.map((fund) => fund.name)).toEqual(["Alpha Fund", "Beta Fund"]);
    expect(JSON.stringify(forward)).not.toContain("meaningful");
  });

  it("puts a fund with no category somewhere rather than dropping it", () => {
    const groups = buildDirectory([row(1, "A Fund", "A AMC", "")]);
    expect(directoryCount(groups)).toBe(1);
    expect(groups[0]?.category).toBe("Uncategorised");
  });

  it("keeps every fund, and breaks a name tie on the code so the order is total", () => {
    const duplicates = [row(9, "Same Name", "A AMC", "Equity"), row(4, "Same Name", "B AMC", "Equity")];
    const groups = buildDirectory(duplicates);
    expect(directoryCount(groups)).toBe(2);
    expect(groups[0]?.funds.map((fund) => fund.code)).toEqual([4, 9]);
  });

  it("counts nothing when there is nothing", () => {
    expect(buildDirectory([])).toEqual([]);
    expect(directoryCount([])).toBe(0);
  });
});
