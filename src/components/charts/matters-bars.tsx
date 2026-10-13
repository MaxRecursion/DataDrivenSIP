/**
 * "What actually matters", in one picture: what picking the named day was worth against a
 * typical day of the month, beside what missing a single instalment has cost. Two bars on one
 * rupee scale, so the reader sees the size difference rather than being told about it.
 *
 * Both figures come from `mattersFigures`, the same calculation the sentences below print, so
 * the bar and the words cannot disagree. A named day that ended with less than a typical day
 * draws as a cost, never as a gain. Plain markup in rem, so it scales with the large-screen
 * root size and its labels can't collide.
 */
import type { FundArtifact } from "../../../shared/artifacts";
import type { Answer } from "../../lib/answer";
import { mattersFigures } from "../../lib/disclosure";
import { formatRupees, ordinal } from "../../lib/format";

type Props = { fund: FundArtifact; answer: Answer };

export default function MattersBars({ fund, answer }: Props) {
  const { edgeRupees, perInstalment } = mattersFigures(fund, answer);
  const day = ordinal(answer.date);
  const rows = [
    { label: `The ${day} vs a typical day`, value: edgeRupees },
    { label: "One missed instalment", value: -perInstalment },
  ];
  const most = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <div data-chart="matters" className="mb-4 space-y-3 2xl:mb-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink">{row.label}</span>
            <span className="shrink-0 font-display text-lg font-bold text-ink">
              {`${row.value < 0 ? "−" : "+"}${formatRupees(Math.abs(row.value))}`}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-raised ring-1 ring-line">
            {/* A sliver stays visible: a ₹6 edge still draws as a mark, not as nothing. */}
            <div
              className={`h-full rounded-full ${row.value >= 0 ? "bg-teal" : "bg-loss"}`}
              style={{ width: `${Math.max((Math.abs(row.value) / most) * 100, 1.5)}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-mute-text">Both bars are on the same rupee scale.</p>
      <p className="sr-only">
        {edgeRupees >= 0
          ? `Picking the ${day} over a typical day gained ${formatRupees(edgeRupees)}.`
          : `Picking the ${day} over a typical day ended ${formatRupees(-edgeRupees)} lower.`}{" "}
        Missing one instalment cost {formatRupees(perInstalment)}.
      </p>
    </div>
  );
}
