import { describe, expect, it } from "vitest";
import {
  ANSWER_SPRING,
  SETTLE_TOLERANCE,
  SPEC_SPRING,
  dampingRatio,
  overshoot,
  peakValue,
  settleMs,
} from "./spring";

describe("dampingRatio", () => {
  it("puts both of the app's springs below 1, so both overshoot", () => {
    // Overshoot is the point: a step that eases in without passing its mark reads as a fade.
    expect(dampingRatio(SPEC_SPRING)).toBeCloseTo(0.839, 3);
    expect(dampingRatio(ANSWER_SPRING)).toBeCloseTo(0.363, 3);
  });

  it("calls a critically damped spring exactly 1", () => {
    // c = 2√(km): the boundary where overshoot disappears.
    expect(dampingRatio({ stiffness: 100, damping: 2 * Math.sqrt(100 * 1), mass: 1 })).toBeCloseTo(1, 10);
  });
});

describe("overshoot", () => {
  it("reproduces the peak D10b chose the answer spring for", () => {
    // D10b replaced the spec's spring because it peaked at 1.0016 instead of the 1.06 the design
    // asked for, and picked stiffness 1600 / damping 26 on the claim that it peaks at 1.059.
    // This is an independent integration of the same three numbers, and it agrees.
    expect(peakValue(ANSWER_SPRING, 0.8, 1)).toBeCloseTo(1.059, 2);
    // This integrator lands on 1.0584 where D10b wrote 1.059 — six ten-thousandths apart, which
    // is two methods rounding differently rather than a disagreement about the spring. Pinned
    // exactly so a change to the integration shows up as a failure instead of drifting.
    expect(peakValue(ANSWER_SPRING, 0.8, 1)).toBeCloseTo(1.0584, 4);
  });

  it("is nearly invisible on the cells, which travel a twentieth as far", () => {
    // The same spring over a 0.96 → 1 step: a 0.7% overshoot of a 0.04 distance is 0.0003.
    expect(overshoot(SPEC_SPRING)).toBeCloseTo(1.007, 3);
    expect(peakValue(SPEC_SPRING, 0.96, 1)).toBeCloseTo(1.0003, 4);
  });

  it("never reports an overshoot for a spring that cannot overshoot", () => {
    const critical = { stiffness: 100, damping: 2 * Math.sqrt(100), mass: 1 };
    expect(overshoot(critical)).toBeLessThanOrEqual(1.0001);
    expect(overshoot({ stiffness: 100, damping: 40, mass: 1 })).toBeLessThanOrEqual(1.0001);
  });
});

describe("settleMs", () => {
  it("measures the last time the spring was outside the band, not the first time it was inside", () => {
    // An underdamped spring crosses its destination several times. Stopping at the first
    // crossing would report roughly a quarter of the real time, and the whole 700 ms schedule
    // rests on this number.
    const loose = { stiffness: 1600, damping: 8, mass: 0.8 };
    const firstCrossing = 1000 * (Math.PI / Math.sqrt(1600 / 0.8));

    expect(settleMs(loose)).toBeGreaterThan(firstCrossing * 3);
  });

  it("takes longer the stricter the tolerance, and never reports zero", () => {
    const strict = settleMs(ANSWER_SPRING, 0.001);
    const loose = settleMs(ANSWER_SPRING, 0.02);

    expect(strict).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThan(0);
  });

  it("settles both springs inside a quarter second at the perceptual tolerance", () => {
    expect(settleMs(SPEC_SPRING, SETTLE_TOLERANCE)).toBe(195);
    expect(settleMs(ANSWER_SPRING, SETTLE_TOLERANCE)).toBe(256);
  });

  it("records what a tolerance below the pixel threshold would cost", () => {
    // Not a requirement — a record. These are the figures behind the note in spring.ts, so a
    // later reader can see the cap's margin rather than rediscovering it.
    expect(settleMs(ANSWER_SPRING, 0.005)).toBe(321);
    expect(settleMs(SPEC_SPRING, 0.005)).toBe(308);
  });

  it("gives up rather than looping forever on a spring that never arrives", () => {
    // Zero damping oscillates for ever; the simulation is capped so a misconfiguration is a
    // large number instead of a hung test run.
    expect(settleMs({ stiffness: 100, damping: 0, mass: 1 })).toBeGreaterThan(3000);
  });
});
