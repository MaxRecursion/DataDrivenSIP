/**
 * The one required input (spec §6.1): type a fund, get its page.
 *
 * The input element is always mounted and owns its own keyboard handling, so nothing is
 * swapped under the caret when the results chunk arrives. index.json loads on the first
 * keystroke, never on page load, and the highlighted fund's data is prefetched so choosing
 * it feels instant.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { IndexRow } from "../../shared/artifacts";
import { loadIndex, prefetchFund } from "../lib/data";
import { searchFunds } from "../lib/search";
import { fundPath, parseParams } from "../lib/url";

const SearchList = lazy(() => import("./search-list"));

const DEBOUNCE_MS = 120;

export function FundSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IndexRow[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);

  const index = useRef<IndexRow[] | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [search] = useSearchParams();

  const ensureIndex = useCallback(async (): Promise<IndexRow[]> => {
    index.current ??= await loadIndex();
    return index.current;
  }, []);

  const run = useCallback(
    async (value: string): Promise<IndexRow[]> => {
      const rows = await ensureIndex();
      const hits = searchFunds(rows, value);
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
      navigate(fundPath(row[0], parseParams(search)));
    },
    [navigate, search],
  );

  const onChange = (value: string) => {
    setQuery(value);
    setOpen(value.trim().length > 0);
    if (pending.current) clearTimeout(pending.current);
    if (value.trim().length === 0) {
      setResults([]);
      return;
    }
    pending.current = setTimeout(() => void run(value), DEBOUNCE_MS);
  };

  const onKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
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
        role="combobox"
        aria-expanded={open}
        aria-controls="fund-search-results"
        className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
      />

      {open ? (
        <Suspense fallback={null}>
          <SearchList
            query={query}
            results={results}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            onChoose={choose}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
