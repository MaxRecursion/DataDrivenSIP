/**
 * "How confident is this?", as two gauges a reader can take in without reading the paragraphs
 * under them. Each shows this fund's figure beside the bar it would need to clear:
 *
 *   - Ordering repeated: stability on its −1 to 1 scale, against the 0.60 the verdict needs.
 *   - Top-quarter finishes: how often the named day finished in the top quarter of dates across
 *     rolling 3-year stretches, against the 25% chance alone would give it.
 *
 * Both are the fund's own published figures — nothing is compared across funds. A gauge whose
 * input couldn't be measured isn't drawn at all, rather than drawn at a misleading zero.
 */
import type { ApexOptions } from "apexcharts";
import type { FundArtifact } from "../../../shared/artifacts";
import type { Answer } from "../../lib/answer";
import { sharePercent, stabilityPercent } from "../../lib/charts";
import { ordinal } from "../../lib/format";
import { useWide } from "../../lib/use-wide";
import { ApexChart, type Palette } from "./apex";

/** Shorter on the wide dashboard, where the half-circle's empty lower half is height it can't spare. */
const HEIGHT = 170;
const WIDE_HEIGHT = 140;
const THRESHOLD = 0.6;
const CHANCE = 25;

/** A half-circle radial gauge: this fund's ring outside, the bar it needs to clear inside. */
function gauge(
  palette: Palette,
  scale: number,
  series: [number, number],
  labels: [string, string],
  formatValue: (value: number) => string,
): ApexOptions {
  return {
    chart: { type: "radialBar" },
    series,
    labels,
    colors: [palette.teal, palette.line],
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        hollow: { size: "52%" },
        track: { background: palette.raised, strokeWidth: "100%", margin: 4 },
        dataLabels: {
          /*
           * A multi-series radialBar only shows a ring's value while it's hovered, which on a
           * phone is never. `total` pins this fund's own figure in the centre permanently; the
           * inner ring's figure is in the caption instead.
           */
          name: { show: true, offsetY: 16 * scale, fontSize: "0.6875rem", color: palette.mute },
          value: {
            show: true,
            offsetY: -20 * scale,
            fontSize: "1.375rem",
            fontFamily: "Cabinet Grotesk, system-ui, sans-serif",
            fontWeight: 700,
            color: palette.ink,
          },
          total: {
            show: true,
            label: labels[0],
            color: palette.mute,
            formatter: () => formatValue(series[0]),
          },
        },
      },
    },
    stroke: { lineCap: "round" },
    tooltip: { enabled: false },
  };
}

type Props = { fund: FundArtifact; answer: Answer };

export default function ConfidenceGauge({ fund, answer }: Props) {
  const height = useWide() ? WIDE_HEIGHT : HEIGHT;
  const stability = stabilityPercent(fund.stability);
  const share = sharePercent(answer.result.topQ);
  if (stability === null && share === null) return null;

  const version = `${fund.code}:${fund.stability}:${answer.date}:${answer.result.topQ}`;
  const day = ordinal(answer.date);

  return (
    <div data-chart="confidence" className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {stability === null ? null : (
        <figure className="m-0">
          <ApexChart
            height={height}
            version={`stability:${version}`}
            build={(palette, scale) =>
              gauge(palette, scale, [stability, stabilityPercent(THRESHOLD)!], ["This fund", "Needs"], (value) =>
                (value / 50 - 1).toFixed(2),
              )
            }
          />
          <figcaption className="-mt-12 text-center text-xs text-mute-text 2xl:-mt-9">
            Ordering repeated between halves. Inner ring: the 0.60 needed
          </figcaption>
        </figure>
      )}
      {share === null ? null : (
        <figure className="m-0">
          <ApexChart
            height={height}
            version={`share:${version}`}
            build={(palette, scale) =>
              gauge(palette, scale, [share, CHANCE], [`The ${day}`, "Chance"], (value) => `${Math.round(value)}%`)
            }
          />
          <figcaption className="-mt-12 text-center text-xs text-mute-text 2xl:-mt-9">
            Top-quarter finishes. Inner ring: {CHANCE}% by chance
          </figcaption>
        </figure>
      )}

      {/* The text equivalent of both gauges; the paragraphs below say the same in full. */}
      <p className="sr-only">
        {fund.stability === null
          ? ""
          : `Ordering repeated: this fund scores ${fund.stability.toFixed(2)} against the 0.60 needed. `}
        {share === null
          ? ""
          : `Top-quarter finishes: the ${day} ${Math.round(share)}% of stretches, against ${CHANCE}% by chance.`}
      </p>
    </div>
  );
}
