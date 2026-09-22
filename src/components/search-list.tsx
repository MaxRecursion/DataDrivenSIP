/**
 * The results list, loaded on demand (spec §6.1, PLAN.md §9). cmdk renders and labels the
 * list; the input and its keyboard handling stay in FundSearch so nothing swaps under the
 * reader's caret mid-typing.
 *
 * Search matches are ordered by text relevance only. The one ranked list is the trending list
 * shown for an empty field, ordered by NAV change over the past month and labelled as such —
 * ranking funds was allowed from 2026-09-22 (CLAUDE.md).
 */
import { Command } from "cmdk";
import { Fragment } from "react";
import type { IndexRow } from "../../shared/artifacts";

type SearchListProps = {
  query: string;
  results: readonly IndexRow[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onChoose: (row: IndexRow) => void;
  /** Shown above the rows, saying what a ranked list is ranked by. */
  heading?: string | undefined;
  /** How many leading rows are recents, so they can carry their own heading. */
  recentCount?: number;
  /** A short figure per fund code, shown on the row's right (the trending list's change). */
  notes?: ReadonlyMap<number, string> | undefined;
};

const identity = (row: IndexRow) => `${row[1]}|${row[2]}|${row[3]}`;

export default function SearchList({
  query,
  results,
  highlighted,
  onHighlight,
  onChoose,
  heading,
  recentCount = 0,
  notes,
}: SearchListProps) {
  const active = results[highlighted];

  // Three pairs of schemes share a name, house and category exactly. They are different
  // schemes with different histories, and the AMFI code is the only thing that separates
  // them, so show it on those rows — and only there, so the rest stay readable.
  const keys = results.map(identity);
  const ambiguous = new Set(keys.filter((key, index) => keys.indexOf(key) !== index));

  return (
    <Command
      shouldFilter={false}
      label={heading ?? "Matching funds"}
      value={active ? String(active[0]) : ""}
      className="mt-2 overflow-hidden rounded-xl border border-line bg-raised"
      id="fund-search-results"
    >
      {recentCount > 0 ? (
        <p data-list-heading className="border-b border-line px-4 pt-3 pb-2 text-xs text-mute-text">
          Recently opened
        </p>
      ) : heading ? (
        <p data-list-heading className="border-b border-line px-4 pt-3 pb-2 text-xs text-mute-text">
          {heading}
        </p>
      ) : null}
      <Command.List className="max-h-80 overflow-y-auto py-1">
        {results.length === 0 ? (
          <Command.Empty className="px-4 py-3 text-sm text-mute-text">
            No fund matches “{query}”. Only Direct plans with a growth option are covered.
          </Command.Empty>
        ) : null}

        {results.map((row, index) => (
          <Fragment key={row[0]}>
            {index === recentCount && recentCount > 0 && heading ? (
              <p className="border-t border-line px-4 pt-3 pb-2 text-xs text-mute-text">{heading}</p>
            ) : null}
            <Command.Item
              value={String(row[0])}
              onSelect={() => onChoose(row)}
              onPointerMove={() => onHighlight(index)}
              className="cursor-pointer px-4 py-2 data-[selected=true]:bg-surface"
            >
              <span className="block text-ink">{row[1]}</span>
              <span className="flex items-baseline justify-between gap-3 text-sm text-mute-text">
                <span>
                  {row[3] ? `${row[2]}, ${row[3]}` : row[2]}
                  {ambiguous.has(identity(row)) ? `, code ${row[0]}` : ""}
                </span>
                {notes?.has(row[0]) ? (
                  <span
                    data-trend-change={notes.get(row[0])?.includes("%") ? "" : undefined}
                    className={`tabular shrink-0 font-medium ${
                      notes.get(row[0])?.startsWith("−")
                        ? "text-loss"
                        : notes.get(row[0])?.includes("%")
                          ? "text-teal"
                          : "text-mute-text"
                    }`}
                  >
                    {notes.get(row[0])}
                  </span>
                ) : null}
              </span>
            </Command.Item>
          </Fragment>
        ))}
      </Command.List>
    </Command>
  );
}
