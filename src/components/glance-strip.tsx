/**
 * Two small, silent previews of what the disclosure sections below say — placed right under
 * the calendar, for a reader who, reasonably, doesn't read every section on every fund page.
 * The same two glyphs reappear next to "The full curve" and "How confident is this?"
 * (disclosures.tsx), so a reader who does open a section recognises the shape rather than
 * meeting a third, different depiction of the same fact.
 *
 * `aria-hidden`: everything here is already stated in words, either in the calendar's own
 * caption (the span) or inside the disclosure sections (confidence) — a screen reader hears it
 * once rather than twice. Purely decorative, and static: nothing here transitions.
 */
import type { FundArtifact } from "../../shared/artifacts";
import { formatPp } from "../lib/format";
import { ConfidenceGlyph, CurveGlyph } from "./glance-icons";

export function GlanceStrip({ fund }: { fund: FundArtifact }) {
  return (
    <p aria-hidden="true" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-mute-text">
      <span className="flex items-center gap-2">
        <CurveGlyph xirrs={fund.dates.map((row) => row.xirr)} />
        {formatPp(fund.spreadPp)} range
      </span>
      <span className="flex items-center gap-1.5">
        <ConfidenceGlyph confidence={fund.confidence} />
        {fund.confidence === "full" ? "Full confidence" : "Reduced confidence"}
      </span>
    </p>
  );
}
