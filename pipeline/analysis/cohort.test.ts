import { describe, expect, it } from "vitest";
import type { FundArtifact } from "../../shared/artifacts";
import { COHORT_BAND, COHORT_FLOOR, MIN_COHORT, cohortOf, cohortSpreads, withCohortSpread } from "./cohort";

/** Only the two fields banding and medians read; the rest is filler the functions never touch. */
const fund = (code: number, instalments: number, spreadPp: number): FundArtifact =>
  ({ code, instalments, spreadPp, cohortSpreadPp: null }) as unknown as FundArtifact;

/** `count` funds in one band, with the spreads given, so a median has something to land on. */
const band = (instalments: number, spreads: number[]): FundArtifact[] =>
  spreads.map((spread, index) => fund(index + 1, instalments, spread));

describe("cohortOf", () => {
  it("starts its first band where eligibility starts, at 37 instalments", () => {
    expect(cohortOf(COHORT_FLOOR)).toBe(0);
    expect(cohortOf(COHORT_FLOOR + COHORT_BAND - 1)).toBe(0);
    expect(cohortOf(COHORT_FLOOR + COHORT_BAND)).toBe(1);
  });

  it("puts a decade of history in a later band than three years of it", () => {
    // 40 months and 200 months must never be compared against the same typical spread — that
    // is the whole reason this exists (D21).
    expect(cohortOf(40)).not.toBe(cohortOf(200));
    expect(cohortOf(200)).toBeGreaterThan(cohortOf(40));
  });

  it("never returns a negative band, however short the history", () => {
    // Nothing under 37 instalments is published, but a band index of -1 would silently collide
    // with another band's key rather than failing.
    expect(cohortOf(0)).toBe(0);
    expect(cohortOf(36)).toBe(0);
  });
});

describe("cohortSpreads", () => {
  it("takes the middle spread of the band, not the mean, so one outlier can't move it", () => {
    const spreads = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 99];
    const medians = cohortSpreads(band(40, spreads));
    // The mean here is about 10.35; the median is what a typical fund actually looks like.
    expect(medians.get(cohortOf(40))).toBe(0.55);
  });

  it("averages the two middle values on an even count", () => {
    const medians = cohortSpreads(band(40, [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2]));
    expect(medians.get(cohortOf(40))).toBe(1.1);
  });

  it("publishes nothing for a band too thin to have a typical value", () => {
    // Nine funds is not a cohort. Offering a "typical" from it would invite a reader to compare
    // their fund against a handful of others and read it as a norm.
    const thin = cohortSpreads(band(40, Array.from({ length: MIN_COHORT - 1 }, () => 0.5)));
    expect(thin.has(cohortOf(40))).toBe(false);

    const enough = cohortSpreads(band(40, Array.from({ length: MIN_COHORT }, () => 0.5)));
    expect(enough.get(cohortOf(40))).toBe(0.5);
  });

  it("keeps each band's funds out of every other band's median", () => {
    const medians = cohortSpreads([
      ...band(40, Array.from({ length: MIN_COHORT }, () => 0.8)),
      ...band(200, Array.from({ length: MIN_COHORT }, () => 0.05)),
    ]);
    expect(medians.get(cohortOf(40))).toBe(0.8);
    expect(medians.get(cohortOf(200))).toBe(0.05);
  });
});

describe("withCohortSpread", () => {
  it("gives every fund the typical spread for its own length", () => {
    const artifacts = [
      ...band(40, Array.from({ length: MIN_COHORT }, () => 0.8)),
      ...band(200, Array.from({ length: MIN_COHORT }, () => 0.05)),
    ];
    const published = withCohortSpread(artifacts);

    expect(published.find((a) => a.instalments === 40)?.cohortSpreadPp).toBe(0.8);
    expect(published.find((a) => a.instalments === 200)?.cohortSpreadPp).toBe(0.05);
  });

  it("leaves a fund in a thin band with null rather than a borrowed number", () => {
    const published = withCohortSpread(band(40, [0.8, 0.9]));
    expect(published[0]?.cohortSpreadPp).toBeNull();
  });

  it("returns new artifacts and leaves the originals alone", () => {
    const artifacts = band(40, Array.from({ length: MIN_COHORT }, () => 0.5));
    const published = withCohortSpread(artifacts);

    expect(published[0]).not.toBe(artifacts[0]);
    expect(artifacts[0]?.cohortSpreadPp).toBeNull();
  });
});
