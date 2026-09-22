/**
 * "What actually matters", in one picture: what picking the named day was worth against a
 * typical day of the month, beside what missing a single instalment has cost. Gains run right
 * in teal, costs run left in red, on one rupee axis — so the reader sees the scale difference
 * rather than being told about it.
 *
 * Both figures come from `mattersFigures`, the same calculation the sentences below print, so
 * the bar and the words cannot disagree. A named day that ended with less than a typical day
 * draws as a cost, never as a gain.
 */
import type { ApexOptions } from "apexcharts";
import type { FundArtifact } from "../../../shared/artifacts";
import type { Answer } from "../../lib/answer";
import { mattersFigures } from "../../lib/disclosure";
import { formatRupees, formatRupeesAxis, ordinal } from "../../lib/format";
import { ApexChart, type Palette } from "./apex";

const HEIGHT = 150;

type Props = { fund: FundArtifact; answer: Answer };

export default function MattersBars({ fund, answer }: Props) {
  const { edgeRupees, perInstalment } = mattersFigures(fund, answer);
  const day = ordinal(answer.date);
  // Short enough not to truncate at 360 px; the sentences below say it in full.
  const labels = [`The ${day} vs a typical day`, "One missed instalment"];
  const values = [edgeRupees, -perInstalment];

  const build = (palette: Palette): ApexOptions => ({
    chart: { type: "bar" },
    series: [{ name: "Rupees", data: values }],
    colors: values.map((value) => (value >= 0 ? palette.teal : palette.loss)),
    plotOptions: {
      bar: { horizontal: true, distributed: true, barHeight: "56%", borderRadius: 4 },
    },
    dataLabels: {
      enabled: true,
      formatter: (value: number) => `${value < 0 ? "−" : "+"}${formatRupees(Math.abs(value))}`,
      style: { fontSize: "11px", fontWeight: 600, colors: [palette.ink] },
      offsetX: 0,
    },
    xaxis: {
      categories: labels,
      labels: {
        style: { colors: palette.mute, fontSize: "10px" },
        formatter: (value: string) => formatRupeesAxis(Math.abs(Number(value))),
      },
      tickAmount: 4,
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: palette.ink, fontSize: "11px" }, maxWidth: 200 } },
    grid: { borderColor: palette.line, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    legend: { show: false },
    tooltip: { enabled: false },
  });

  return (
    <div data-chart="matters" className="mb-4">
      <ApexChart height={HEIGHT} version={`${fund.code}:${edgeRupees}:${perInstalment}`} build={build} />
      <p className="sr-only">
        {edgeRupees >= 0
          ? `Picking the ${day} over a typical day gained ${formatRupees(edgeRupees)}.`
          : `Picking the ${day} over a typical day ended ${formatRupees(-edgeRupees)} lower.`}{" "}
        Missing one instalment cost {formatRupees(perInstalment)}.
      </p>
    </div>
  );
}
