/**
 * One element, animated on WAAPI (PLAN.md §8.1, following D10a's precedent).
 *
 * §8.1 specifies Motion's `LazyMotion` + `m` components. Measured, that costs about 67 KB
 * gzipped and puts total JS at 203 KB against §9's hard 180 KB limit — `LazyMotion` drags the
 * animation engine in whichever entry `m` is imported from, so the lazy-features split does not
 * help. D10a already made this exact call once, rejecting `domMax` because "28 KB … would push
 * total JS to roughly 187 KB, over budget", and hand-writing the morph on WAAPI instead. The
 * same reasoning applies with more force here, so the whole reveal is hand-written.
 *
 * What §8.1 actually asks for survives intact: only `opacity` and full `transform` strings, both
 * of which WAAPI runs off the main thread; springs, compiled to `linear()` easings by spring.ts;
 * and an interrupt that lands the final state at zero duration.
 *
 * The element renders in its FINAL state and the animation plays from `from` up to it, so a cold
 * render needs no JavaScript to look right (§8.1). An interrupted animation is `finish()`ed and
 * never cancelled: cancelling reverts to `from`, which would strand an invisible cell or the
 * previous fund's date on screen.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { linearEasing, settleMs, type Spring } from "../lib/spring";

type Keyframe = { opacity?: number; transform?: string };

type AnimatedProps = {
  /**
   * The reveal generation to play under, or null to render the final state and animate nothing.
   * Changing it replays; React's own cleanup lands whatever was running, which is how an
   * interrupted sequence is abandoned without a separate registry of handles.
   */
  play: number | null;
  /** Where the animation starts. The element already renders where it ends. */
  from: Keyframe;
  /** Where it ends, which must match what the element renders statically. */
  to?: Keyframe;
  spring: Spring;
  /** §8.2's offset for this element, in milliseconds. */
  delayMs?: number;
  className?: string;
  style?: CSSProperties | undefined;
  children?: ReactNode;
};

const SETTLED: Keyframe = { opacity: 1, transform: "none" };

export function Animated({
  play,
  from,
  to = SETTLED,
  spring,
  delayMs = 0,
  className,
  style,
  children,
}: AnimatedProps) {
  const host = useRef<HTMLDivElement>(null);
  // Serialised so a changed keyframe re-runs the effect without making the caller memoise.
  const shape = JSON.stringify({ from, to, spring, delayMs });

  useEffect(() => {
    const element = host.current;
    if (play === null || !element) return;
    // A browser without WAAPI simply shows the final state, which is already rendered.
    if (typeof element.animate !== "function") return;

    // §8.1: promoted for the duration and never in static CSS, where it would pin a layer for
    // every cell for the life of the page.
    element.style.willChange = "transform, opacity";
    const release = () => {
      element.style.willChange = "";
    };

    const animation = element.animate([{ ...from }, { ...to }], {
      duration: settleMs(spring),
      delay: delayMs,
      easing: linearEasing(spring),
      // The element must not sit at its final state during the delay; `backwards` holds it at
      // `from` until its turn, which is what makes the stagger a stagger.
      fill: "backwards",
    });

    // Released when it ends on its own; `catch` because an interrupted animation rejects here
    // and the cleanup below has already dealt with it.
    animation.finished.then(release).catch(() => {});

    return () => {
      // Land it. Never cancel: that reverts to `from`, and `from` is invisible.
      animation.finish();
      release();
    };
  }, [play, shape]);

  return (
    <div ref={host} className={className} style={style}>
      {children}
    </div>
  );
}
