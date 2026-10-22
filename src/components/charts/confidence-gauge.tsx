/**
 * "How confident is this?", as two meters a reader can take in without reading the paragraphs
 * under them. Each shows this fund's figure as a bar, with a tick where it would need to land:
 *
 *   - Ordering repeated: stability on its −1 to 1 scale, against the 0.60 the verdict needs.
 *   - Top-quarter finishes: how often the named day finished in the top quarter of dates across
 *     rolling 3-year stretches, against the 25% chance alone would give it.
 *
 * Plain markup sized in rem, so it grows with the large-screen root scale and nothing can
 * overlap the way text drawn inside a chart's canvas did. Both are the fund's own published
 * figures — nothing is compared across funds. A meter whose input couldn't be measured isn't
 * drawn at all, rather than drawn at a misleading zero.
 */
import type { FundArtifact } from "../../../shared/artifacts";
import type { Answer } from "../../lib/answer";
import { sharePercent, stabilityPercent } from "../../lib/charts";
import { ordinal } from "../../lib/format";

const THRESHOLD = 0.6;
const CHANCE = 25;

const clamp = (value: number) => Math.min(100, Math.max(0, value));

type MeterProps = {
  label: string;
  value: string;
  fill: number;
  mark: number;
  markLabel: string;
};

function Meter({ label, value, fill, mark, markLabel }: MeterProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <span className="shrink-0 font-display text-xl text-ink">{value}</span>
      </div>
      <div className="relative mt-2 h-3 rounded-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]">
        <div className="h-full rounded-full bg-up" style={{ width: `${clamp(fill)}%` }} />
        <div
          className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${clamp(mark)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-mute-text">{markLabel}</p>
    </div>
  );
}

type Props = { fund: FundArtifact; answer: Answer };

export default function ConfidenceGauge({ fund, answer }: Props) {
  const stability = stabilityPercent(fund.stability);
  const share = sharePercent(answer.result.topQ);
  if (stability === null && share === null) return null;

  const day = ordinal(answer.date);

  return (
    <div data-chart="confidence" className="mb-4 grid grid-cols-1 gap-4 2xl:mb-3 2xl:gap-3">
      {stability === null || fund.stability === null ? null : (
        <Meter
          label="Ordering repeated"
          value={fund.stability.toFixed(2)}
          fill={stability}
          mark={stabilityPercent(THRESHOLD)!}
          markLabel={`The tick is the ${THRESHOLD.toFixed(2)} it needs`}
        />
      )}
      {share === null ? null : (
        <Meter
          label={`The ${day} in the top quarter`}
          value={`${Math.round(share)}%`}
          fill={share}
          mark={CHANCE}
          markLabel={`The tick is the ${CHANCE}% chance alone would give`}
        />
      )}
    </div>
  );
}
