/**
 * The results list, loaded on demand (spec §6.1, PLAN.md §9). cmdk renders and labels the
 * list; the input and its keyboard handling stay in FundSearch so nothing swaps under the
 * reader's caret mid-typing.
 *
 * Rows are ordered by text relevance only, never by any metric (CLAUDE.md).
 */
import { Command } from "cmdk";
import type { IndexRow } from "../../shared/artifacts";

type SearchListProps = {
  query: string;
  results: readonly IndexRow[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onChoose: (row: IndexRow) => void;
};

const identity = (row: IndexRow) => `${row[1]}|${row[2]}|${row[3]}`;

export default function SearchList({ query, results, highlighted, onHighlight, onChoose }: SearchListProps) {
  const active = results[highlighted];

  // Three pairs of schemes share a name, house and category exactly. They are different
  // schemes with different histories, and the AMFI code is the only thing that separates
  // them, so show it on those rows — and only there, so the rest stay readable.
  const keys = results.map(identity);
  const ambiguous = new Set(keys.filter((key, index) => keys.indexOf(key) !== index));

  return (
    <Command
      shouldFilter={false}
      label="Matching funds"
      value={active ? String(active[0]) : ""}
      className="mt-2 overflow-hidden rounded-xl border border-line bg-raised"
      id="fund-search-results"
    >
      <Command.List className="max-h-80 overflow-y-auto py-1">
        {results.length === 0 ? (
          <Command.Empty className="px-4 py-3 text-sm text-mute-text">
            No fund matches “{query}”. Only Direct plans with a growth option are covered.
          </Command.Empty>
        ) : null}

        {results.map((row, index) => (
          <Command.Item
            key={row[0]}
            value={String(row[0])}
            onSelect={() => onChoose(row)}
            onPointerMove={() => onHighlight(index)}
            className="cursor-pointer px-4 py-2 data-[selected=true]:bg-surface"
          >
            <span className="block text-ink">{row[1]}</span>
            <span className="block text-sm text-mute-text">
              {row[2]}, {row[3]}
              {ambiguous.has(identity(row)) ? ` · code ${row[0]}` : ""}
            </span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
