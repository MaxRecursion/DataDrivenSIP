/**
 * The full curve (PLAN.md §6.5): every date's return as a bar, the window in teal and the
 * answered date in marigold.
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
  window: number[];
  answer: number;
};

/** The palette lives in one place; the canvas reads it rather than repeating the hex. */
function palette(): { neutral: string; window: string; answer: string; axis: string } {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    neutral: read("--line", "#d6dbe4"),
    window: read("--teal", "#0e7c7b"),
    answer: read("--marigold", "#f2a71b"),
    axis: read("--mute-text", "#626b80"),
  };
}

export default function SpreadChart({ fund, window: windowDates, answer }: SpreadChartProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const allowed = new Set(windowDates);
    const colours = palette();
    const dates = fund.dates.map((row) => row.d);
    const rate = (predicate: (d: number) => boolean) =>
      fund.dates.map((row) => (predicate(row.d) ? row.xirr : null));

    // Three series rather than one with per-bar fills: uPlot colours a series, so splitting the
    // dates across three of them is how each group gets its own colour without reaching for the
    // bars path builder's display facets, which are far easier to get subtly wrong.
    const data: uPlot.AlignedData = [
      dates,
      rate((d) => !allowed.has(d)),
      rate((d) => allowed.has(d) && d !== answer),
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
        series("Other dates", colours.neutral),
        series("Your window", colours.window),
        series("Your date", colours.answer),
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
  }, [fund, windowDates, answer]);

  return (
    <div data-spread-chart="">
      <div ref={host} aria-hidden="true" style={{ height: HEIGHT }} />

      {/* The text equivalent of the picture, and what the e2e suite reads. */}
      <ul className="sr-only">
        {fund.dates.map((row) => {
          const inWindow = windowDates.includes(row.d);
          return (
            <li
              key={row.d}
              data-bar-date={row.d}
              data-in-window={inWindow ? "" : undefined}
              data-answer={row.d === answer ? "" : undefined}
            >
              {ordinal(row.d)}: {formatPp(row.xirr)}
              {row.d === answer ? ", your date" : inWindow ? ", in your window" : ""}
            </li>
          );
        })}
      </ul>

      {/* Colour is never the only cue (§6.5): the groups are named here in text as well. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute-text">
        <span className="flex items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-sm bg-marigold" />
          Your date, the {ordinal(answer)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-sm bg-teal" />
          The rest of your window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 shrink-0 rounded-sm bg-line" />
          Dates your salary rules out
        </span>
      </p>
    </div>
  );
}
