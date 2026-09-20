/**
 * The full curve: every date's return as a bar, with the selected day in marigold.
 *
 * The y-axis is zoomed to this fund's own range, which is the only way a tenth of a percentage
 * point is visible at all — and is also exactly how a chart lies. The caption underneath states
 * the real span, and `disclosure.ts` writes it; this file draws the shape and nothing else.
 *
 * Lazy by construction: uPlot is about 23 KB gzipped and nothing here is imported until a reader
 * opens the section, so a page that is never opened never pays for it.
 *
 * The canvas is aria-hidden — it restates numbers the section already gives in words — and the
 * same values are rendered beside it as a visually hidden list, which is both the text
 * equivalent for a screen reader and what the e2e suite reads to check the picture agrees with
 * the answer.
 */
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { FundArtifact } from "../../shared/artifacts";
import { formatPp, ordinal } from "../lib/format";

/** Reserved so opening the section doesn't shift what is under it (D13: CLS 0). */
const HEIGHT = 208;

type SpreadChartProps = {
  fund: FundArtifact;
  answer: number;
};

/** The palette lives in one place; the canvas reads it rather than repeating the hex. */
function palette(): { neutral: string; answer: string; axis: string } {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    neutral: read("--line", "#d6dbe4"),
    answer: read("--marigold", "#f2a71b"),
    axis: read("--mute-text", "#626b80"),
  };
}

export default function SpreadChart({ fund, answer }: SpreadChartProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const colours = palette();
    const dates = fund.dates.map((row) => row.d);
    const rate = (predicate: (d: number) => boolean) =>
      fund.dates.map((row) => (predicate(row.d) ? row.xirr : null));

    // Two series rather than one with per-bar fills: uPlot colours a series, so splitting the
    // selected day out is how it gets its own colour without reaching for the
    // bars path builder's display facets, which are far easier to get subtly wrong.
    const data: uPlot.AlignedData = [
      dates,
      rate((d) => d !== answer),
      rate((d) => d === answer),
    ];

    const bars = uPlot.paths.bars?.({ size: [0.76, 24], gap: 1 });

    const series = (label: string, fill: string): uPlot.Series => ({
      label,
      ...(bars ? { paths: bars } : {}),
      points: { show: false },
      stroke: fill,
      fill,
      width: 0,
    });

    const options: uPlot.Options = {
      width: element.clientWidth || 320,
      height: HEIGHT,
      // The reader is given the numbers in words; hovering a 28-bar chart adds nothing and
      // costs a cursor-tracking listener on every frame.
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: {
          // Zoomed to the data. Padded so the tallest bar isn't flush against the top edge and
          // the shortest still has a visible body.
          range: (_u, min, max) => {
            const pad = (max - min) * 0.18 || 0.01;
            return [min - pad, max + pad];
          },
        },
      },
      axes: [
        {
          stroke: colours.axis,
          grid: { show: false },
          ticks: { show: false },
          font: "11px Satoshi, system-ui, sans-serif",
          // Chosen here rather than filtered from uPlot's own splits: left to itself it picked
          // ticks that my filter then blanked, and the axis came out labelled "15" and nothing
          // else. A 28-bar chart whose bars can't be identified is a decoration.
          splits: () => [1, 7, 14, 21, 28],
          values: (_u, splits) => splits.map((value) => String(value)),
        },
        {
          stroke: colours.axis,
          grid: { stroke: colours.neutral, width: 1 },
          ticks: { show: false },
          font: "11px Satoshi, system-ui, sans-serif",
          size: 52,
          values: (_u, splits) => splits.map((value) => `${value.toFixed(2)}%`),
        },
      ],
      series: [
        {},
        series("Other SIP days", colours.neutral),
        series("Best SIP day", colours.answer),
      ],
    };

    const chart = new uPlot(options, data, element);
    // Without this the chart keeps whatever width it had when the section was opened, which is
    // wrong the moment the phone is turned.
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width && width > 0) chart.setSize({ width, height: HEIGHT });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      chart.destroy();
    };
  }, [fund, answer]);

  return (
    <div data-spread-chart="">
      <div ref={host} aria-hidden="true" style={{ height: HEIGHT }} />

      {/* The text equivalent of the picture, and what the e2e suite reads. */}
      <ul className="sr-only">
        {fund.dates.map((row) => {
          return (
            <li
              key={row.d}
              data-bar-date={row.d}
              data-answer={row.d === answer ? "" : undefined}
            >
              {ordinal(row.d)}: {formatPp(row.xirr)}
              {row.d === answer ? ", best SIP day" : ""}
            </li>
          );
        })}
      </ul>

      {/* Colour is never the only cue (§6.5): the groups are named here in text as well. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute-text">
        <span className="flex items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-sm bg-marigold" />
          Best SIP day, the {ordinal(answer)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-sm bg-line" />
          Other SIP days
        </span>
      </p>
    </div>
  );
}
