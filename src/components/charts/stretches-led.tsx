/**
 * How many rolling 3-year stretches each date of the month led outright, with the named day
 * marked. The day is named on its whole-history return, not on leading, so the tallest column
 * is often a different date — and that disagreement is the honest thing to show, not hide.
 *
 * One fund's 28 dates, never a comparison between funds. Not drawn for a fund too young to have
 * rolling stretches, where every column would be a meaningless zero.
 */
import type { ApexOptions } from "apexcharts";
import type { FundArtifact } from "../../../shared/artifacts";
import type { Answer } from "../../lib/answer";
import { ledSeries } from "../../lib/charts";
import { ordinal } from "../../lib/format";
import { useWide } from "../../lib/use-wide";
import { ApexChart, type Palette } from "./apex";

const HEIGHT = 190;
const WIDE_HEIGHT = 150;
/** Labels only where a reader can find their place, as the full-curve chart does. */
const LABELLED = new Set([1, 7, 14, 21, 28]);

type Props = { fund: FundArtifact; answer: Answer };

export default function StretchesLed({ fund, answer }: Props) {
  const height = useWide() ? WIDE_HEIGHT : HEIGHT;
  const series = ledSeries(fund, answer.date);
  if (series === null) return null;

  const build = (palette: Palette): ApexOptions => ({
    chart: { type: "bar" },
    series: [{ name: "Stretches led", data: series.led }],
    colors: series.led.map((_, index) => (index === series.highlight ? palette.marigold : palette.line)),
    plotOptions: { bar: { distributed: true, columnWidth: "72%", borderRadius: 2 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: series.dates.map(String),
      labels: {
        style: { colors: palette.mute, fontSize: "0.625rem" },
        formatter: (value: string) => (LABELLED.has(Number(value)) ? value : ""),
        rotate: 0,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: palette.mute, fontSize: "0.625rem" } }, forceNiceScale: true },
    grid: { borderColor: palette.line, strokeDashArray: 3 },
    legend: { show: false },
    tooltip: {
      enabled: true,
      theme: "light",
      x: { formatter: (value: number) => `The ${ordinal(Number(value))}` },
    },
  });

  const most = Math.max(...series.led);
  return (
    <figure data-chart="stretches-led" className="m-0 mb-4">
      <ApexChart height={height} version={`${fund.code}:${answer.date}:${series.led.join(",")}`} build={build} />
      <figcaption className="text-xs text-mute-text">
        Rolling 3-year stretches each date led, the {ordinal(answer.date)} marked
      </figcaption>
      <ul className="sr-only">
        {series.dates.map((date, index) => (
          <li key={date} data-led-date={date}>
            {ordinal(date)}: led {series.led[index]}
            {index === series.highlight ? ", the named day" : ""}
            {series.led[index] === most ? ", the most of any date" : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
