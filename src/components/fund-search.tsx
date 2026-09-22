/**
 * The one required input (spec §6.1): type a fund, get its page.
 *
 * The input element is always mounted and owns its own keyboard handling, so nothing is
 * swapped under the caret when the results chunk arrives. index.json loads on the first
 * keystroke, never on page load, and the highlighted fund's data is prefetched so choosing
 * it feels instant.
 *
 * Clicked (or arrowed into) while empty, it shows the funds whose NAV rose most over the past
 * month (trending.json). Not on focus: the home page autofocuses this field, and a list that
 * opened on arrival would cover the page before anyone asked for it.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { IndexRow, Trending } from "../../shared/artifacts";
import { loadIndex, loadTrending, prefetchFund } from "../lib/data";
import { formatSignedPercent } from "../lib/format";
import { searchFunds } from "../lib/search";
import { fundPath } from "../lib/url";

const SearchList = lazy(() => import("./search-list"));

const DEBOUNCE_MS = 120;

export function FundSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndexRow[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  /** Non-null while the list is showing trending funds rather than search matches. */
  const [trending, setTrending] = useState<Trending | null>(null);

  const index = useRef<IndexRow[] | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const ensureIndex = useCallback(async (): Promise<IndexRow[]> => {
    index.current ??= await loadIndex();
    return index.current;
  }, []);

  const run = useCallback(
    async (value: string): Promise<IndexRow[]> => {
      const rows = await ensureIndex();
      const hits = searchFunds(rows, value);
      setTrending(null);
      setResults(hits);
      setHighlighted(0);
      // Warm the fund the reader is most likely to choose.
      if (hits[0]) prefetchFund(hits[0][0]);
      return hits;
    },
    [ensureIndex],
  );

  const choose = useCallback(
    (row: IndexRow) => {
      setOpen(false);
      navigate(fundPath(row[0]));
    },
    [navigate],
  );

  /** The empty field's list: trending funds, shaped as index rows so keyboard handling is shared. */
  const showTrending = useCallback(async () => {
    const loaded = await loadTrending();
    if (!loaded || loaded.funds.length === 0) return;
    // The reader may have started typing while the file was in flight; their query wins.
    if (input.current && input.current.value.trim().length > 0) return;
    setTrending(loaded);
    setResults(loaded.funds.map((row): IndexRow => [row.code, row.name, row.house, ""]));
    setHighlighted(0);
    setOpen(true);
    const first = loaded.funds[0];
    if (first) prefetchFund(first.code);
  }, []);

  const onChange = (value: string) => {
    setQuery(value);
    // Typing replaces the trending list at once, not after the debounce.
    setTrending(null);
    setOpen(value.trim().length > 0);
    if (pending.current) clearTimeout(pending.current);
    if (value.trim().length === 0) {
      setResults([]);
      return;
    }
    pending.current = setTimeout(() => void run(value), DEBOUNCE_MS);
  };

  const onKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && !open && query.trim().length === 0) {
      event.preventDefault();
      void showTrending();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        const wrapped = (next + results.length) % Math.max(1, results.length);
        const row = results[wrapped];
        if (row) prefetchFund(row[0]);
        return wrapped;
      });
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key !== "Enter") return;

    // Enter flushes the debounce rather than waiting it out, so a fast typist isn't punished.
    event.preventDefault();
    if (pending.current) clearTimeout(pending.current);
    const hits = results.length > 0 ? results : await run(query);
    const row = hits[Math.min(highlighted, hits.length - 1)] ?? hits[0];
    if (row) choose(row);
  };

  // "/" jumps to the field, unless the reader is already typing somewhere.
  useEffect(() => {
    const onDocumentKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onDocumentKey);
    return () => document.removeEventListener("keydown", onDocumentKey);
  }, []);

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="fund-search">
        Search for a fund
      </label>
      <input
        ref={input}
        id="fund-search"
        type="search"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Search a fund"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => void onKeyDown(event)}
        onFocus={() => setOpen(query.trim().length > 0)}
        onClick={() => {
          if (query.trim().length === 0) void showTrending();
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls="fund-search-results"
        className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-ink 2xl:py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />

      {open ? (
        <Suspense fallback={null}>
          <SearchList
            query={query}
            results={results}
            heading={trending ? "Trending: biggest NAV gains over the past month" : undefined}
            notes={
              trending
                ? new Map(trending.funds.map((row) => [row.code, `${formatSignedPercent(row.monthPct)} in a month`]))
                : undefined
            }
            highlighted={highlighted}
            onHighlight={setHighlighted}
            onChoose={choose}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
