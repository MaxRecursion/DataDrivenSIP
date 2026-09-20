/**
 * The rupee figure counting up at the end of the reveal (PLAN.md §8.2, §8.1).
 *
 * It writes `textContent` through a ref inside one rAF loop. No React state changes per frame:
 * twenty-odd renders of the answer block, each re-running the copy and the grid, is how a
 * reveal that is nothing but a number ends up costing more than the rest of the sequence
 * combined.
 *
 * Three elements, because the number has three jobs:
 *   - a visually hidden copy of the FINAL value, so a screen reader and a copy-paste get the
 *     answer rather than whatever frame the loop was on (§6.6);
 *   - an invisible copy of the final string, which reserves the width so the line cannot reflow
 *     as digits change (§8.1, and CLS stays 0);
 *   - the one the loop writes into, laid over the reserved space and aria-hidden.
 *
 * Counting is not animation in the CSS sense — no property is transitioned — so nothing here
 * touches the transform-and-opacity rule.
 */
import { useEffect, useRef } from "react";

type RupeeTickerProps = {
  /** The figure to land on. */
  value: number;
  /** How to render it, at every frame and at rest. */
  format: (value: number) => string;
  /**
   * The reveal generation to count for, or null to render the final value at once — a cold load,
   * a back button, or a reader who asked for reduced motion (D10c, §8.3).
   */
  reveal: number | null;
  /** §8.2: the ticker's own cap. The sequence's 700 ms ends on it. */
  durationMs?: number;
  /** §8.2 starts it at 500 ms, after the answer has landed. */
  delayMs?: number;
  className?: string;
};

/** Decelerating, so the last digits settle rather than snapping. */
const ease = (t: number) => 1 - (1 - t) * (1 - t);

export function RupeeTicker({
  value,
  format,
  reveal,
  durationMs = 200,
  delayMs = 0,
  className,
}: RupeeTickerProps) {
  const counter = useRef<HTMLSpanElement>(null);
  const final = format(value);

  useEffect(() => {
    const element = counter.current;
    // Null reveal means there is nothing to count: the markup already holds the final value.
    if (reveal === null || !element) return;

    let frame = 0;
    let start: number | null = null;

    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / durationMs);
      element.textContent = format(value * ease(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    // Blank until its turn, not "₹0". The figure sits inside a sentence — "ended ₹0 apart on
    // ₹16.4 lakh invested" — so a zero held for half a second is a false statement about the
    // fund, where an absence is merely an absence. The sibling reserves the width either way.
    element.textContent = "";
    const begin = setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      clearTimeout(begin);
      cancelAnimationFrame(frame);
      // Land the final value. An interrupted ticker that kept its last frame would leave a
      // number on screen that is close to the truth and not the truth, which is worse than
      // either extreme (§8.1: cancelling sets the final state at zero duration).
      element.textContent = format(value);
    };
  }, [reveal, value, format, durationMs, delayMs]);

  return (
    <span className={className} style={{ position: "relative", display: "inline-block" }}>
      <span className="sr-only">{final}</span>
      {/* Reserves the width from the final string, so no frame can reflow the line. */}
      <span aria-hidden="true" style={{ visibility: "hidden" }}>
        {final}
      </span>
      <span
        ref={counter}
        aria-hidden="true"
        data-rupee-ticker=""
        style={{ position: "absolute", left: 0, top: 0, right: 0 }}
      >
        {final}
      </span>
    </span>
  );
}
