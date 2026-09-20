import { describe, expect, it, vi } from "vitest";
import {
  SCHEDULE,
  SEQUENCE_CAP_MS,
  Sequence,
  DIAGONAL_COUNT,
  diagonalIndexAt,
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

  it("starts the last cell at 148 ms, amending §8.2's 276", () => {
    // §8.2 tabulated 28 cells at 60 + 8·i, so the last began at 276. The grid is a real month
    // now: six rows by seven columns, staggered over the 12 diagonals rather than over 28
    // dates, so the wave closes at 148 and the window step at 260 still follows it cleanly.
    const cells = SCHEDULE.cells!;
    expect(cells.start + cells.stagger * (cells.count - 1)).toBe(148);
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

describe("diagonalIndexAt", () => {
  it("gives one index per down-and-right diagonal of the six-by-seven grid", () => {
    const indices = new Set<number>();
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 7; column++) indices.add(diagonalIndexAt(row, column));
    }
    // 0 through 11: the top-left cell and the bottom-right one, and every diagonal between.
    expect(indices.size).toBe(DIAGONAL_COUNT);
    expect(Math.max(...indices)).toBe(DIAGONAL_COUNT - 1);
  });

  it("puts cells on one diagonal at the same moment, which is what makes it a wave", () => {
    // A row down and a column left is the same diagonal, so these arrive together.
    expect(diagonalIndexAt(1, 2)).toBe(diagonalIndexAt(2, 1));
    expect(diagonalIndexAt(0, 0)).toBe(0);
  });

  it("orders by position, not by date, so a month that starts mid-week still sweeps", () => {
    // September 2026 opens on a Tuesday: the 1st sits at row 0, column 2, and the 6th — the
    // smaller distance from the corner — arrives before it. Ordering by the date got this
    // backwards, because it assumed the 1st was always in column 0.
    const first = diagonalIndexAt(0, 2);
    const sixth = diagonalIndexAt(1, 0);
    expect(sixth).toBeLessThan(first);
  });

  it("stays inside the stagger the schedule budgets for it", () => {
    const cells = SCHEDULE.cells!;
    expect(cells.count).toBe(DIAGONAL_COUNT);
    expect(cells.start + cells.stagger * (DIAGONAL_COUNT - 1)).toBeLessThan(SCHEDULE.answer!.start);
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
