/**
 * Spring arithmetic, so the reveal's 700 ms budget is a calculation rather than a hope.
 *
 * PLAN.md §8.2 schedules five overlapping steps and asserts the last of them finishes by
 * 700 ms. Every one of those steps is a spring, and a spring has no duration — it has a settle
 * time, which falls out of its stiffness, damping and mass. This computes that settle time by
 * integrating the spring's own equation, so the schedule can be tested instead of eyeballed.
 *
 * D10b also turns on a spring's overshoot: the spec's answer spring peaks at 1.0016 where the
 * design called for 1.06, and the replacement (stiffness 1600, damping 26) was chosen because it
 * peaks at 1.059 and still settles inside the budget. `overshoot` is what checks that claim.
 *
 * Pure: no I/O, no clock, no randomness, no dependency on Motion itself. Motion compiles springs
 * to CSS `linear()` easings from the same three numbers, so this models what it will produce.
 */

export type Spring = {
  stiffness: number;
  damping: number;
  mass: number;
};

/** PLAN.md §8.1: everything but the answer cell uses the spec's spring. */
export const SPEC_SPRING: Spring = { stiffness: 400, damping: 30, mass: 0.8 };

/** D10b: the answer cell alone, chosen to peak near 1.06 and still settle in time. */
export const ANSWER_SPRING: Spring = { stiffness: 1600, damping: 26, mass: 0.8 };

/**
 * How close to its destination the value has to be, as a fraction of the distance travelled,
 * before a reader would call it arrived.
 *
 * Set by what a screen can show, not by what makes the schedule fit. The largest distance
 * anything here animates is the answer cell's 0.8 → 1 scale, and on a 64 px cell one percent of
 * that is 0.13 px — a fifth of a device pixel on a 2× display, and less on a phone. Even two
 * percent stays under half a pixel. A stricter figure measures arithmetic nobody can see.
 *
 * Worth knowing, because it is the one number the 700 ms cap is sensitive to: at 0.5% the answer
 * step settles at 321 ms rather than 256 ms and the sequence closes at 721 ms, over §8.2's cap.
 * `sequence.test.ts` asserts that explicitly so the margin is on the record.
 */
export const SETTLE_TOLERANCE = 0.01;

/** Half a millisecond. Fine enough that the integration error is far below the tolerance. */
const STEP_SECONDS = 0.0005;

/** Nothing in this app should spring for a second; past it, treat the spring as misconfigured. */
const MAX_SECONDS = 4;

/** The damping ratio: below 1 the spring overshoots, at or above it never does. */
export function dampingRatio({ stiffness, damping, mass }: Spring): number {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

/**
 * Integrates the spring from 0 to 1 and hands each sample to `visit`. Semi-implicit Euler:
 * velocity first, then position, which stays stable at this step size where plain Euler drifts.
 */
function simulate(spring: Spring, visit: (elapsed: number, value: number, velocity: number) => void): void {
  const { stiffness, damping, mass } = spring;
  let value = 0;
  let velocity = 0;

  for (let elapsed = 0; elapsed <= MAX_SECONDS; elapsed += STEP_SECONDS) {
    const acceleration = (stiffness * (1 - value) - damping * velocity) / mass;
    velocity += acceleration * STEP_SECONDS;
    value += velocity * STEP_SECONDS;
    visit(elapsed + STEP_SECONDS, value, velocity);
  }
}

/**
 * When the spring is within `tolerance` of its destination and stays there, in milliseconds.
 *
 * The last moment it was outside the band, not the first moment it was inside: an underdamped
 * spring crosses its destination several times, and stopping at the first crossing would report
 * a quarter of the real time.
 */
export function settleMs(spring: Spring, tolerance: number = SETTLE_TOLERANCE): number {
  let lastOutside = 0;
  simulate(spring, (elapsed, value) => {
    if (Math.abs(1 - value) > tolerance) lastOutside = elapsed;
  });
  return Math.ceil(lastOutside * 1000);
}

/**
 * The furthest the spring travels past its destination, as a multiple of the distance. 1 means
 * it never overshoots; 1.294 means it goes 29.4% beyond before coming back.
 *
 * Scale it by the distance actually animated to get what appears on screen: a cell going from
 * 0.8 to 1 with an overshoot of 1.294 peaks at 0.8 + 0.2 × 1.294 = 1.059.
 */
export function overshoot(spring: Spring): number {
  let peak = 0;
  simulate(spring, (_elapsed, value) => {
    if (value > peak) peak = value;
  });
  return peak;
}

/** What a reader actually sees at the peak, for a spring animating `from` to `to`. */
export function peakValue(spring: Spring, from: number, to: number): number {
  return from + (to - from) * overshoot(spring);
}

/**
 * The spring's shape as a CSS `linear()` easing, which is how a spring reaches the compositor.
 *
 * WAAPI has no spring timing function, so the curve is sampled at even intervals and handed over
 * as the easing of a fixed-duration animation. The browser interpolates between the samples, and
 * at this density the difference from the true curve is far below the tolerance the settle time
 * is measured at. Motion does the same thing internally; this keeps the 60 KB that comes with it
 * out of the bundle (§9's total is a hard 180 KB).
 */
export function linearEasing(spring: Spring, samples = 40): string {
  const duration = settleMs(spring) / 1000;
  const curve: number[] = [];

  let next = 0;
  simulate(spring, (elapsed, value) => {
    if (elapsed >= next && curve.length < samples) {
      curve.push(value);
      next += duration / (samples - 1);
    }
  });

  // The last sample is the destination exactly, so the animation cannot end a hair short of it.
  curve[curve.length - 1] = 1;
  return `linear(${curve.map((value) => value.toFixed(4)).join(", ")})`;
}
