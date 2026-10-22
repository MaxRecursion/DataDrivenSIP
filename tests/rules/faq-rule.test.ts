/**
 * The home page states the verdict rule in words, twice — in the FAQ and in its body copy — and
 * the FAQ goes out to Google as FAQPage markup. The first version said "noise when either test
 * fails". `verdictOf` says noise only when both do, and 108 of the 375 marginal funds sat inside
 * the gap between the two readings.
 *
 * Prose can't be type-checked against code, so this ties them the only way it can: the engine's
 * own truth table on one side, the sentence's claims on the other, and the thresholds the copy
 * interpolates checked against the ones the engine uses. It lives here rather than in `src`
 * because it imports the pipeline, which the app project deliberately doesn't.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPREAD_THRESHOLD_PP as ENGINE_SPREAD,
  STABILITY_THRESHOLD as ENGINE_STABILITY,
  verdictOf,
} from "../../pipeline/analysis/verdict";
import { SPREAD_THRESHOLD_PP, STABILITY_THRESHOLD } from "../../src/lib/copy";
import { HOME_FAQ } from "../../src/lib/faq";

const rule = HOME_FAQ.find((entry) => entry.question === "What does a verdict of noise mean?")?.answer ?? "";

describe("the verdict rule the home page states", () => {
  it("is stated at all", () => {
    expect(rule.length).toBeGreaterThan(0);
  });

  it("uses the engine's thresholds, not a copy of them that could drift", () => {
    expect(SPREAD_THRESHOLD_PP).toBe(ENGINE_SPREAD);
    expect(STABILITY_THRESHOLD).toBe(ENGINE_STABILITY);
    expect(rule).toContain(`${ENGINE_SPREAD} percentage points`);
    expect(rule).toContain(ENGINE_STABILITY.toFixed(2));
  });

  // Just inside and just outside each threshold, so the truth table is the engine's own at its
  // edges rather than at comfortable interior values.
  const narrow = ENGINE_SPREAD - 0.01;
  const wide = ENGINE_SPREAD + 0.01;
  const unstable = ENGINE_STABILITY - 0.01;
  const stable = ENGINE_STABILITY + 0.01;

  it("says a fund passing neither test is noise — and the engine agrees", () => {
    expect(rule).toContain("passes neither is noise");
    expect(verdictOf(narrow, unstable)).toBe("noise");
    expect(verdictOf(narrow, null)).toBe("noise");
  });

  it("says a fund passing one test is marginal, whichever one — and the engine agrees", () => {
    // The sentence the first version got wrong: a narrow spread alone does not make noise.
    expect(rule).toContain("passes one is marginal");
    expect(verdictOf(wide, unstable)).toBe("marginal");
    expect(verdictOf(narrow, stable)).toBe("marginal");
  });

  it("says only a fund passing both is meaningful — and the engine agrees", () => {
    expect(rule).toContain("passes both is meaningful");
    expect(verdictOf(wide, stable)).toBe("meaningful");
  });

  it("is never restated with an 'or' on the home page either", () => {
    // The body copy restates the rule outside the FAQ. It has to join the two tests with "and".
    const home = readFileSync(join(import.meta.dirname, "../../src/routes/home.tsx"), "utf8").replace(/\s+/g, " ");
    expect(home).toMatch(/no wider than \{SPREAD_THRESHOLD_PP\} percentage points and the ordering/);
    expect(home).not.toMatch(/percentage points, or where the ordering/);
  });
});
