/**
 * The ten dates a SIP may land on (PLAN.md D6), from when salary arrives and how many days
 * of buffer sit after it.
 *
 * The arithmetic runs on a 1-based 28-day circle, so a window that starts late in the month
 * wraps into the next one without ever producing day 0 or a date past the 28th. The naive
 * `(salary + buffer) % 28` gives day 0 for a salary on the 26th with a 2-day buffer.
 *
 * Salary on the 29th, 30th or 31st is treated as the last working day, because those dates
 * don't exist in every month. Carrying them through the modulo instead would start the
 * window on the 4th or 5th, which pushes the SIP later than it needs to be.
 */
import type { AppParams } from "./url";

/** A window is always ten dates long, whatever the salary day and buffer are. */
export const WINDOW_LENGTH = 10;

/** SIP dates are 1-28 only, so that is the circumference the window wraps on. */
const CIRCLE = 28;

export function safeWindow({ salary, buffer }: AppParams): number[] {
  // `start` may exceed 28 (the 28th with a 7-day buffer gives 35); it is never below 1, so
  // the modulo below never sees a negative.
  const start = salary === "last" || salary >= 29 ? 1 + buffer : salary + buffer;
  return Array.from({ length: WINDOW_LENGTH }, (_, k) => ((start + k - 1) % CIRCLE) + 1);
}
