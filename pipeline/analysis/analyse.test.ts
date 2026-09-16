import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FundArtifact } from "../../shared/artifacts";
import { analyse } from "./analyse";
import { dayFromIso, isoFromDay } from "./dates";
import { buildHistory, parseNavRows, type NavHistory } from "./nav";

type MfapiFile = {
  meta: { scheme_code: number; scheme_name: string; fund_house: string; scheme_category: string };
  data: { date: string; nav: string }[];
};

const CUTOFF = dayFromIso("2026-09-11");

function load(file: string, keepLastMonths?: number): { history: NavHistory; meta: MfapiFile["meta"] } {
  const raw = JSON.parse(readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8")) as MfapiFile;
  let rows = parseNavRows(raw.data).filter((row) => row.day <= CUTOFF);
  if (keepLastMonths !== undefined) {
    const last = rows.at(-1)?.day ?? 0;
    const [year, month, day] = isoFromDay(last).split("-").map(Number);
    const total = (year ?? 0) * 12 + (month ?? 1) - 1 - keepLastMonths;
    const start = dayFromIso(
      `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}-${String(day ?? 1).padStart(2, "0")}`,
    );
    rows = rows.filter((row) => row.day >= start);
  }
  return { history: buildHistory(rows), meta: raw.meta };
}

const expected = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/expected/${name}.json`, import.meta.url), "utf8")) as FundArtifact;

function run(file: string, keepLastMonths?: number): FundArtifact {
  const { history, meta } = load(file, keepLastMonths);
  return analyse(history, {
    code: meta.scheme_code,
    name: meta.scheme_name,
    house: meta.fund_house,
    category: meta.scheme_category,
  });
}

// The expected artifacts come from the Phase 0 reference harness, which a second agent
// reimplemented independently and confirmed row by row (docs/research/phase-0/02-*).
describe.each([
  ["kotak-full", "119775.nav.json", undefined],
  ["quant-40m", "151713.nav.json", undefined],
  ["kotak-40m", "119775.nav.json", 40],
  ["kotak-37m", "119775.nav.json", 37],
  ["kotak-36m", "119775.nav.json", 36],
] as const)("%s", (name, file, months) => {
  it("matches the expected artifact exactly", () => {
    expect(run(file, months)).toEqual(expected(name));
  });
});

// Acceptance criterion 3. These values are the user's, verified independently of this engine.
describe("criterion 3: Kotak Mid Cap, NAVs to 2026-09-11", () => {
  const artifact = run("119775.nav.json");
  const byDate = (d: number) => artifact.dates[d - 1];

  it("covers 3 January 2013 to 11 September 2026 with 164 instalments", () => {
    expect(artifact.navFrom).toBe("2013-01-03");
    expect(artifact.navTo).toBe("2026-09-11");
    expect(artifact.instalments).toBe(164);
    expect(artifact.dates).toHaveLength(28);
  });

  it("puts the 26th highest at about 20.39% and the 9th lowest at about 20.28%", () => {
    const xirrs = artifact.dates.map((date) => date.xirr);
    const highest = xirrs.indexOf(Math.max(...xirrs)) + 1;
    const lowest = xirrs.indexOf(Math.min(...xirrs)) + 1;
    expect(highest).toBe(26);
    expect(lowest).toBe(9);
    expect(byDate(26)?.xirr).toBeCloseTo(20.39, 2);
    expect(byDate(9)?.xirr).toBeCloseTo(20.28, 2);
    expect(byDate(1)?.xirr).toBe(20.304);
  });

  it("grades the spread as noise", () => {
    expect(artifact.spreadPp).toBe(0.114);
    expect(artifact.stability).toBe(0.545);
    expect(artifact.verdict).toBe("noise");
    expect(artifact.confidence).toBe("full");
    expect(artifact.windows).toBe(128);
    expect(artifact.metricsAgree).toBe(false);
  });

  it("counts rolling-window wins only where the reference harness does", () => {
    const wins = Object.fromEntries(artifact.dates.filter((date) => date.w > 0).map((date) => [date.d, date.w]));
    expect(wins).toEqual({ 1: 3, 4: 3, 13: 5, 16: 10, 22: 29, 23: 10, 24: 32, 25: 18, 26: 16, 27: 2 });
  });

  it("ranks the 12th top of the default window and the 25th top of a 17th-to-26th window", () => {
    const topOf = (window: number[]) =>
      window.reduce((best, d) => ((artifact.dates[d - 1]?.meanPct ?? 0) > (artifact.dates[best - 1]?.meanPct ?? 0) ? d : best));
    expect(topOf([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(12);
    expect(topOf([17, 18, 19, 20, 21, 22, 23, 24, 25, 26])).toBe(25);
  });
});

// Acceptance criterion 5.
describe("criterion 5: a fund with about 40 months of history", () => {
  const artifact = run("151713.nav.json");

  it("returns a reduced-confidence result rather than crashing", () => {
    expect(artifact.confidence).toBe("reduced");
    expect(artifact.windows).toBe(5);
    expect(artifact.dates).toHaveLength(28);
    expect(artifact.dates.every((date) => Number.isFinite(date.xirr))).toBe(true);
  });
});

describe("very short histories", () => {
  it("has no rolling windows at 36 months, so percentiles are null and nothing is NaN", () => {
    const artifact = run("119775.nav.json", 36);
    expect(artifact.windows).toBe(0);
    expect(artifact.confidence).toBe("reduced");
    for (const date of artifact.dates) {
      expect(date.meanPct).toBeNull();
      expect(date.topQ).toBeNull();
      expect(date.w).toBe(0);
      expect(Number.isFinite(date.xirr)).toBe(true);
    }
    expect(Number.isFinite(artifact.spreadPp)).toBe(true);
  });
});

describe("artifact shape", () => {
  const artifact = run("119775.nav.json");

  it("rounds every float to 3 decimals and keeps rupees whole", () => {
    const decimals = (value: number) => (value.toString().split(".")[1] ?? "").length;
    expect(decimals(artifact.spreadPp)).toBeLessThanOrEqual(3);
    expect(decimals(artifact.stability ?? 0)).toBeLessThanOrEqual(3);
    expect(Number.isInteger(artifact.spreadRupees)).toBe(true);
    for (const date of artifact.dates) {
      expect(decimals(date.xirr)).toBeLessThanOrEqual(3);
      expect(decimals(date.meanPct ?? 0)).toBeLessThanOrEqual(3);
      expect(decimals(date.topQ ?? 0)).toBeLessThanOrEqual(3);
      expect(Number.isInteger(date.corpus)).toBe(true);
    }
  });

  it("fits in 2 KB gzipped", async () => {
    const { gzipSync } = await import("node:zlib");
    expect(gzipSync(Buffer.from(JSON.stringify(artifact)), { level: 9 }).length).toBeLessThan(2048);
  });
});
