/**
 * The reveal sequence: its schedule (PLAN.md §8.2) and the controller that owns it (§8.1).
 *
 * The schedule is data rather than a comment, so `sequence.test.ts` can add every spring's
 * settle time to its start offset and assert the whole thing finishes inside 700 ms. Springs
 * have no duration — change a stiffness and the end moves — so a schedule written as prose
 * would drift out of true silently.
 *
 * The controller exists because a reveal can be interrupted. A reader who picks a second fund,
 * presses Escape or chooses another fund mid-flight must land on the finished state at once, not
 * watch the old animation play out or, worse, see two sequences fight. Every moving part is
 * registered against a generation token; bumping it abandons the old one and lands it.
 *
 * Pure of the DOM: the controller stores teardown callbacks the caller supplies, so it can be
 * tested without a browser and the component decides what "land it" means for each handle.
 */
import { ANSWER_SPRING, SPEC_SPRING, type Spring, settleMs } from "./spring";

/** §8.2's cap. The whole sequence is over by here, however it was scheduled. */
export const SEQUENCE_CAP_MS = 700;

export type Step = {
  /** When the first element of this step starts, in ms from the sequence's start. */
  start: number;
  /** Gap between elements, in ms. Zero for a step with one element. */
  stagger: number;
  /** How many elements the step animates. */
  count: number;
  /** The spring it animates with, or null for the ticker, which is a fixed-length rAF loop. */
  spring: Spring | null;
  /** For the ticker: its own capped duration (§8.1). */
  duration?: number;
};

/** §8.1: the ticker's own cap, and what the sequence's 700 ms total lands on. */
export const TICKER_MS = 200;

/**
 * §8.2's timing, amended for the calendar rewrite: cells arrive diagonally, the colour fills
 * sweep in behind them, the answer lands, and the rupee figure counts up. The FLIP morph from
 * the search row was never built — see PLAN.md's Phase 6 gate, still open.
 */
/**
 * The diagonals of the calendar grid: six week rows by seven columns, so `row + column` runs
 * 0 to 11 and every cell on one down-and-right diagonal shares an index. Cells that share a
 * diagonal arrive together, which is what makes the reveal read as a wave.
 *
 * Keyed on the grid position rather than on the date, because a real month does not start in
 * column 0. September 2026 begins on a Tuesday, and ordering by the date put the wave in an
 * order with no relation to what was on screen.
 */
export const DIAGONAL_COUNT = 12;

export function diagonalIndexAt(row: number, column: number): number {
  return row + column;
}

export const SCHEDULE: Record<string, Step> = {
  card: { start: 0, stagger: 0, count: 1, spring: SPEC_SPRING },
  cells: { start: 60, stagger: 8, count: DIAGONAL_COUNT, spring: SPEC_SPRING },
  fills: { start: 260, stagger: 12, count: DIAGONAL_COUNT, spring: SPEC_SPRING },
  answer: { start: 400, stagger: 0, count: 1, spring: ANSWER_SPRING },
  ticker: { start: 500, stagger: 0, count: 1, spring: null, duration: TICKER_MS },
};

/** §8.2: the vibration fires with the answer landing, and only on a real gesture (D10c). */
export const VIBRATE_AT_MS = 400;
export const VIBRATE_MS = 8;

/**
 * D10e: a card already on screen doesn't blink. Choosing another fund skips the morph and the
 * cell arrival and plays only the window wave, the answer landing and the ticker.
 */
export type Mode = "first" | "repeat";

const REPEAT_STEPS = ["fills", "answer", "ticker"] as const;

export function stepsFor(mode: Mode): Array<[string, Step]> {
  const entries = Object.entries(SCHEDULE);
  return mode === "first" ? entries : entries.filter(([name]) => REPEAT_STEPS.includes(name as never));
}

/** When a step's last element has finished, in ms from the sequence's start. */
export function stepEndMs(step: Step): number {
  const lastStart = step.start + step.stagger * Math.max(0, step.count - 1);
  return lastStart + (step.spring === null ? (step.duration ?? 0) : settleMs(step.spring));
}

/** When the whole sequence has finished. */
export function sequenceEndMs(mode: Mode = "first"): number {
  return Math.max(...stepsFor(mode).map(([, step]) => stepEndMs(step)));
}

/**
 * Owns every moving part of one reveal.
 *
 * Teardowns are supplied by the caller rather than inferred, because "abandon this" means
 * something different for each kind of handle — and for a WAAPI animation it must mean
 * `finish()`, never `cancel()`. Cancelling reverts to the animation's start, which would leave
 * invisible cells and the previous fund's date on screen; finishing lands the final state at
 * zero duration, which is what §8.1 asks for.
 */
export class Sequence {
  private token = 0;
  private teardowns: Array<() => void> = [];

  /** The generation currently allowed to touch the DOM. */
  get generation(): number {
    return this.token;
  }

  /** Abandons whatever is running, lands it, and opens a new generation. */
  begin(): number {
    this.cancel();
    this.token += 1;
    return this.token;
  }

  isCurrent(generation: number): boolean {
    return generation === this.token;
  }

  /**
   * Registers a teardown for a generation. A stale registration runs immediately rather than
   * being stored: it belongs to a sequence that has already been abandoned, and holding it would
   * leave that handle running until the next interruption.
   */
  onCancel(generation: number, teardown: () => void): void {
    if (!this.isCurrent(generation)) {
      teardown();
      return;
    }
    this.teardowns.push(teardown);
  }

  /** Lands everything, newest first, and forgets it. Safe to call when nothing is running. */
  cancel(): void {
    const pending = this.teardowns;
    this.teardowns = [];
    for (let index = pending.length - 1; index >= 0; index--) {
      // One handle throwing must not strand the rest: a half-cancelled sequence is worse than
      // either outcome, because the state it leaves on screen belongs to no fund at all.
      try {
        pending[index]?.();
      } catch {
        // Nothing useful to do here; the remaining teardowns still have to run.
      }
    }
  }
}
