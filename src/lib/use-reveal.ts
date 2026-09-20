/**
 * Decides whether the reveal plays, and hands out the generation it plays under (PLAN.md §8.1,
 * §8.3, D10c, D10e).
 *
 * Most page loads must NOT animate. D10c is explicit: a cold deep link and a back button render
 * the final state instantly, because there is no search result to morph from, an entrance
 * animation would delay LCP, and `navigator.vibrate` needs a user gesture it never had. The
 * sequence plays on one event only — a fund chosen inside the app — which the router already
 * reports as a PUSH.
 *
 * The generation comes from a `Sequence`, so every moving part registered against it can be
 * abandoned and landed the moment a second fund, an Escape or a salary change arrives.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigationType } from "react-router";
import { Sequence, VIBRATE_AT_MS, VIBRATE_MS, type Mode } from "./sequence";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Motion's own `useReducedMotion` would do this, but importing it pulls `motion/react` — and
 * with it the whole animation engine — into the initial bundle, which is the one thing
 * LazyMotion exists to prevent. The media query is three lines.
 *
 * Read synchronously so the first effect already knows the answer; it renders no markup, so
 * there is nothing for hydration to disagree about.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(REDUCED).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(REDUCED);
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export type Reveal = {
  generation: number;
  mode: Mode;
} | null;

/**
 * @param key changes whenever the thing being revealed changes — the fund's code.
 * @param ready false while the fund's data is still in flight; a reveal of nothing is a blink.
 */
export function useReveal(key: string | number | undefined, ready: boolean): Reveal {
  const sequence = useMemo(() => new Sequence(), []);
  const reducedMotion = usePrefersReducedMotion();
  // PUSH is a selection; POP is a cold load, a back or a forward (D10c).
  const chosen = useNavigationType() === "PUSH";
  /** D10e: a grid already on screen doesn't blink, so a second choice skips the morph. */
  const seen = useRef(false);
  const [reveal, setReveal] = useState<Reveal>(null);

  useEffect(() => {
    if (!ready) return;

    const played = seen.current;
    seen.current = true;

    // Reduced motion, or an arrival that wasn't a choice: land on the final state with no
    // sequence at all. Not a zero-duration animation — no animation (§8.3, criterion 8).
    if (reducedMotion || !chosen) {
      sequence.cancel();
      setReveal(null);
      return;
    }

    const generation = sequence.begin();
    setReveal({ generation, mode: played ? "repeat" : "first" });

    // §8.2: the buzz lands with the answer, and only because a gesture asked for it.
    const buzz = setTimeout(() => {
      if (sequence.isCurrent(generation)) navigator.vibrate?.(VIBRATE_MS);
    }, VIBRATE_AT_MS);
    sequence.onCancel(generation, () => clearTimeout(buzz));

    return () => sequence.cancel();
  }, [key, ready, chosen, reducedMotion, sequence]);

  // Whatever unmounts the page abandons the sequence with it.
  useEffect(() => () => sequence.cancel(), [sequence]);

  return reveal;
}
