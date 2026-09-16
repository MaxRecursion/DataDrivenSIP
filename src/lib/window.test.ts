import { describe, expect, it } from "vitest";
import type { Salary } from "./url";
import { WINDOW_LENGTH, safeWindow } from "./window";

const windowFor = (salary: Salary, buffer: number) => safeWindow({ salary, buffer });

/**
 * A second, deliberately plodding implementation of "ten dates from here": step one day at a
 * time and roll 28 back to 1. It shares no arithmetic with the modulo in window.ts, so using
 * it as the expectation checks the formula rather than restating it.
 */
function walk(start: number): number[] {
  let day = ((start - 1) % 28) + 1;
  const dates: number[] = [];
  for (let k = 0; k < WINDOW_LENGTH; k++) {
    dates.push(day);
    day = day === 28 ? 1 : day + 1;
  }
  return dates;
}

/** The forward distance from each date to the next, measured round the 28-day circle. */
function stepsRound(dates: readonly number[]): number[] {
  const steps: number[] = [];
  let previous: number | undefined;
  for (const day of dates) {
    if (previous !== undefined) steps.push((day - previous + 28) % 28);
    previous = day;
  }
  return steps;
}

describe("safeWindow", () => {
  it("puts the default window on the 3rd to the 12th, which is the spec's own example", () => {
    expect(windowFor("last", 2)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("wraps a salary on the 28th onto the 2nd, never onto day 0 or the 30th", () => {
    // (28 + 2) % 28 is 2 only because the circle is 1-based; the naive form gives day 2 here
    // but day 0 for a salary on the 26th, which is the bug D6 exists to avoid.
    expect(windowFor(28, 2)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(windowFor(26, 2)).toEqual([28, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("starts at salary plus buffer for every salary day and buffer the spec checks", () => {
    // D6's third check: salary 1-29 gives s+buffer through s+buffer+9, read on the circle.
    for (let salary = 1; salary <= 29; salary++) {
      for (let buffer = 0; buffer <= 7; buffer++) {
        expect(windowFor(salary, buffer), `salary=${salary} buffer=${buffer}`).toEqual(walk(salary + buffer));
      }
    }
  });

  it("treats salary on the 30th or 31st as the last working day, not as a later start", () => {
    // The deliberate departure from literal mod-28 arithmetic. Those dates are missing from
    // several months, and carrying them through would delay the SIP for no reason.
    const asLastWorkingDay = windowFor("last", 2);
    expect(windowFor(30, 2)).toEqual(asLastWorkingDay);
    expect(windowFor(31, 2)).toEqual(asLastWorkingDay);
    expect(windowFor(30, 2)).not.toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(windowFor(31, 2)).not.toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

    // And the departure holds at every buffer, not just the default one.
    for (let buffer = 0; buffer <= 7; buffer++) {
      expect(windowFor(30, buffer), `buffer=${buffer}`).toEqual(windowFor("last", buffer));
      expect(windowFor(31, buffer), `buffer=${buffer}`).toEqual(windowFor("last", buffer));
    }
  });

  it("can start on the 1st or the 2nd when the buffer is small", () => {
    // Someone who wants the money invested the day it arrives gets a window from the 1st.
    expect(windowFor("last", 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(windowFor("last", 1)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(windowFor(1, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(windowFor(28, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("stays contiguous when the window crosses the 28th back to the 1st", () => {
    // A late salary splits the window across two calendar months; on the circle it is still
    // one unbroken run, which is what the dial and the pick both assume.
    const crossing = windowFor(25, 2);
    expect(crossing).toEqual([27, 28, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stepsRound(crossing)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(crossing).not.toContain(0);
    expect(crossing).not.toContain(29);
  });
});

describe("safeWindow over every input the URL can produce", () => {
  it("always returns ten distinct dates in 1-28 that run consecutively round the circle", () => {
    // parseParams clamps salary to "last" or 1-31 and buffer to 0-7, so this is the whole
    // input space: 32 x 8 combinations, every one of them exhaustively checked.
    const salaries: Salary[] = ["last", ...Array.from({ length: 31 }, (_, i) => i + 1)];

    for (const salary of salaries) {
      for (let buffer = 0; buffer <= 7; buffer++) {
        const dates = safeWindow({ salary, buffer });
        const where = `salary=${salary} buffer=${buffer}`;

        expect(dates, where).toHaveLength(WINDOW_LENGTH);
        expect(new Set(dates).size, where).toBe(WINDOW_LENGTH);
        for (const day of dates) {
          expect(Number.isInteger(day), `${where} day=${day}`).toBe(true);
          expect(day, where).toBeGreaterThanOrEqual(1);
          expect(day, where).toBeLessThanOrEqual(28);
        }
        expect(stepsRound(dates), where).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
      }
    }
  });
});
