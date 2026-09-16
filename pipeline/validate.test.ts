import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FundArtifact } from "../shared/artifacts";
import { checkFundCount, checkIndexSize, gzipBytes, validateArtifact } from "./validate";

const kotak = JSON.parse(
  readFileSync(new URL("./fixtures/expected/kotak-full.json", import.meta.url), "utf8"),
) as FundArtifact;

describe("validateArtifact", () => {
  it("accepts a real artifact", () => {
    expect(validateArtifact(kotak)).toEqual([]);
  });

  it.each([
    ["a missing field", { ...kotak, verdict: undefined }],
    ["an unknown verdict", { ...kotak, verdict: "excellent" }],
    ["an unknown confidence", { ...kotak, confidence: "high" }],
    ["NaN in a rate", { ...kotak, dates: kotak.dates.map((d, i) => (i === 0 ? { ...d, xirr: Number.NaN } : d)) }],
    ["a non-integer corpus", { ...kotak, dates: kotak.dates.map((d, i) => (i === 0 ? { ...d, corpus: 1.5 } : d)) }],
    ["the wrong number of dates", { ...kotak, dates: kotak.dates.slice(0, 27) }],
    ["dates out of order", { ...kotak, dates: [...kotak.dates].reverse() }],
    ["a date outside 1 to 28", { ...kotak, dates: kotak.dates.map((d, i) => (i === 0 ? { ...d, d: 29 } : d)) }],
    ["a malformed navTo", { ...kotak, navTo: "11-09-2026" }],
    ["a negative window count", { ...kotak, windows: -1 }],
  ])("rejects %s", (_label, artifact) => {
    expect(validateArtifact(artifact).length).toBeGreaterThan(0);
  });

  it("allows null meanPct and topQ when there are no windows", () => {
    const noWindows: FundArtifact = {
      ...kotak,
      windows: 0,
      confidence: "reduced",
      dates: kotak.dates.map((date) => ({ ...date, meanPct: null, topQ: null, w: 0 })),
    };
    expect(validateArtifact(noWindows)).toEqual([]);
  });

  it("rejects a null meanPct when windows exist, which would mean a lost calculation", () => {
    const broken: FundArtifact = { ...kotak, dates: kotak.dates.map((date) => ({ ...date, meanPct: null })) };
    expect(validateArtifact(broken).length).toBeGreaterThan(0);
  });
});

describe("gzipBytes", () => {
  it("keeps a real artifact under the 2 KB budget", () => {
    expect(gzipBytes(JSON.stringify(kotak))).toBeLessThan(2048);
  });
});

describe("checkIndexSize", () => {
  it("accepts a small index", () => {
    expect(checkIndexSize(JSON.stringify([[119775, "Kotak Mid Cap Fund", "Kotak", "Equity"]]))).toEqual([]);
  });

  it("rejects one over the budget", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [i, `Fund number ${i} with a fairly long name`, "House", "Category"]);
    expect(checkIndexSize(JSON.stringify(rows), 100).length).toBe(1);
  });
});

describe("checkFundCount", () => {
  it("passes a steady count", () => {
    expect(checkFundCount(1000, 1005)).toEqual([]);
  });

  it("fails a drop of more than a tenth", () => {
    expect(checkFundCount(890, 1000).length).toBeGreaterThan(0);
    expect(checkFundCount(900, 1000)).toEqual([]);
  });

  it("fails counts outside the sane range", () => {
    expect(checkFundCount(700, null).length).toBeGreaterThan(0);
    expect(checkFundCount(2000, null).length).toBeGreaterThan(0);
  });

  it("accepts a first run with no previous count", () => {
    expect(checkFundCount(1043, null)).toEqual([]);
  });
});
