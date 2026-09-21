/**
 * Small, silent previews of what "The full curve" and "How confident is this?" say — for a
 * reader who, reasonably, doesn't open and read every section on every fund page. Each one
 * is `aria-hidden`: the fact it shows is already stated in words nearby (the calendar's own
 * caption, or the disclosure section it sits beside), so a screen reader hears it once rather
 * than twice.
 *
 * Both are static: nothing here transitions, so there is nothing for the transform/opacity
 * rule to apply to. And neither leans on colour alone — the curve is a real shape, and
 * confidence is a stroke pattern (solid vs dashed), not a colour swap.
 */
import type { Confidence } from "../../shared/artifacts";
import { curvePoints } from "../lib/glance";

const WIDTH = 36;
const HEIGHT = 16;
/** Kept off the edges so the stroke's own width doesn't clip against the viewBox. */
const PAD = 2;

/** A miniature of this fund's real 28-date curve — the same figures the calendar prints. */
export function CurveGlyph({ xirrs }: { xirrs: readonly number[] }) {
  const points = curvePoints(xirrs);
  if (points.length < 2) return null;

  const step = (WIDTH - PAD * 2) / (points.length - 1);
  const path = points
    .map((y, index) => `${index === 0 ? "M" : "L"}${(PAD + index * step).toFixed(1)},${(PAD + y * (HEIGHT - PAD * 2)).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} aria-hidden="true" className="shrink-0">
      <path d={path} fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Full confidence: a solid ring. Reduced: a dashed one — a pattern, not just a fainter fill. */
export function ConfidenceGlyph({ confidence }: { confidence: Confidence }) {
  const full = confidence === "full";
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="shrink-0">
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="var(--teal)"
        strokeWidth="2"
        strokeDasharray={full ? undefined : "2.4 2.2"}
      />
    </svg>
  );
}
