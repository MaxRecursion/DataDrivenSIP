import { describe, expect, it, vi } from "vitest";
import {
  SCHEDULE,
  SEQUENCE_CAP_MS,
  Sequence,
  diagonalIndexOf,
  diagonalOrder,
  sequenceEndMs,
  stepEndMs,
  stepsFor,
} from "./sequence";
import { ANSWER_SPRING, settleMs } from "./spring";

describe("the §8.2 schedule", () => {
  it("finishes inside the 700 ms cap the plan sets for it", () => {
    // The assertion §8.2 asks for by name. Springs have no duration, so this is the only thing
    // standing between a stiffness edit and a reveal that quietly runs long.
    expect(sequenceEndMs("first")).toBeLessThanOrEqual(SEQUENCE_CAP_MS);
  });

  it("is bounded by the ticker, not by a spring", () => {
    // Worth knowing which step is load-bearing: the ticker's own 200 ms cap lands exactly on
    // 700, so any spring change has slack but a longer ticker does not.
    expect(stepEndMs(SCHEDULE.ticker!)).toBe(SEQUENCE_CAP_MS);
    expect(stepEndMs(SCHEDULE.answer!)).toBeLessThan(SEQUENCE_CAP_MS);
  });

  it("starts the last cell at 276 ms, as §8.2 tabulates", () => {
    const cells = SCHEDULE.cells!;
    expect(cells.start + cells.stagger * (cells.count - 1)).toBe(276);
  });

  it("would breach the cap at a tolerance finer than a screen pixel", () => {
    // A record, not a requirement: at 0.5% the answer spring settles at 321 ms and the step
    // closes at 721 ms. The tolerance is set by perception in spring.ts, and this keeps the
    // margin visible so nobody has to rediscover it.
    expect(400 + settleMs(ANSWER_SPRING, 0.005)).toBeGreaterThan(SEQUENCE_CAP_MS);
  });

  it("skips the morph and the cell arrival on a second selection (D10e)", () => {
    // A grid already on screen must not blink.
    const names = stepsFor("repeat").map(([name]) => name);
    expect(names).toEqual(["window", "answer", "ticker"]);
    expect(names).not.toContain("card");
    expect(names).not.toContain("cells");
  });

  it("still ends inside the cap on a second selection", () => {
    expect(sequenceEndMs("repeat")).toBeLessThanOrEqual(SEQUENCE_CAP_MS);
  });
});

describe("diagonalOrder", () => {
  it("covers all 28 dates exactly once", () => {
    const order = diagonalOrder();
    expect(order).toHaveLength(28);
    expect(new Set(order).size).toBe(28);
  });

  it("starts at the first cell and sweeps outward in diagonals", () => {
    const order = diagonalOrder();
    expect(order[0]).toBe(1);
    // The 8th and the 2nd share a diagonal (row+column = 1) and follow the 1st.
    expect(order.slice(0, 3).sort((a, b) => a - b)).toEqual([1, 2, 8]);
    // The far corner arrives last.
    expect(order.at(-1)).toBe(28);
  });

  it("gives every date a distinct position, since position is what staggers it", () => {
    const positions = Array.from({ length: 28 }, (_, i) => diagonalIndexOf(i + 1));
    expect(new Set(positions).size).toBe(28);
    expect(Math.max(...positions)).toBe(27);
  });
});

describe("the Sequence controller", () => {
  it("opens a new generation and abandons the previous one", () => {
    const sequence = new Sequence();
    const first = sequence.begin();
    const second = sequence.begin();

    expect(second).not.toBe(first);
    expect(sequence.isCurrent(second)).toBe(true);
    expect(sequence.isCurrent(first)).toBe(false);
  });

  it("lands every handle when a new selection interrupts the old one", () => {
    const sequence = new Sequence();
    const landed: string[] = [];

    const generation = sequence.begin();
    sequence.onCancel(generation, () => landed.push("animation"));
    sequence.onCancel(generation, () => landed.push("ticker"));

    sequence.begin();
    // Newest first, so a handle created by a later step is undone before the one it built on.
    expect(landed).toEqual(["ticker", "animation"]);
  });

  it("runs a stale registration at once rather than storing it", () => {
    // A handle created by a sequence that has already been abandoned would otherwise keep
    // running until the next interruption, which may never come.
    const sequence = new Sequence();
    const stale = sequence.begin();
    sequence.begin();

    const teardown = vi.fn();
    sequence.onCancel(stale, teardown);

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("forgets what it has landed, so a second cancel does nothing twice", () => {
    const sequence = new Sequence();
    const teardown = vi.fn();

    const generation = sequence.begin();
    sequence.onCancel(generation, teardown);
    sequence.cancel();
    sequence.cancel();

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it("is safe to cancel when nothing is running", () => {
    expect(() => new Sequence().cancel()).not.toThrow();
  });

  it("lands the rest even if one handle throws", () => {
    // A half-cancelled sequence leaves state on screen that belongs to no fund at all.
    const sequence = new Sequence();
    const after = vi.fn();

    const generation = sequence.begin();
    sequence.onCancel(generation, after);
    sequence.onCancel(generation, () => {
      throw new Error("a detached animation");
    });

    expect(() => sequence.cancel()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
