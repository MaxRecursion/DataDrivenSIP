/**
 * The directory: every covered fund, by category, each one a real link.
 *
 * It is here because the 1001 fund pages had nothing pointing at them. The search box is the way a
 * person finds a fund and stays the way; this is the way a crawler does, and the way someone who
 * doesn't know a fund's exact name browses to one.
 *
 * Two things it deliberately isn't. It isn't ranked — categories and names are alphabetical, and
 * no figure appears beside a fund, because CLAUDE.md allows exactly one ranked list in this
 * project and it is not this one. And it isn't paginated: one page of a thousand links is a page
 * Google will crawl in a single visit, where twenty paginated pages bury the last of them.
 *
 * The rows are prerendered from the index the build already has, so the markup a crawler reads is
 * the finished list rather than a spinner. In the browser the same list is rebuilt from
 * `index.json` when a reader arrives here by client-side navigation.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { IndexRow } from "../../shared/artifacts";
import { buildDirectory, directoryCount } from "../lib/directory";
import { loadIndex, peekIndex } from "../lib/data";
import { setHead } from "../lib/head";
import { FUNDS_TITLE, fundsDescription } from "../lib/seo";
import { fundPath } from "../lib/url";

export function FundsPage() {
  // Seeded by the prerender and by main.tsx, so the first render on both sides of hydration has
  // the whole list and produces identical markup.
  const [rows, setRows] = useState<IndexRow[]>(() => peekIndex() ?? []);
  // `loadIndex` never rejects: a failed fetch resolves to an empty list, and that result is cached
  // for the session. So an empty list after a load is a failure, not a list still on its way, and
  // saying "loading" forever would be claiming something that will never happen.
  const [settled, setSettled] = useState(() => peekIndex() !== null);

  useEffect(() => {
    if (settled) return;
    let live = true;
    void loadIndex().then((loaded) => {
      if (!live) return;
      setRows(loaded);
      setSettled(true);
    });
    return () => {
      live = false;
    };
  }, [settled]);

  const groups = buildDirectory(rows);
  const count = directoryCount(groups);

  useEffect(() => {
    // Not until the list is in: "every one of the 0 funds" is not a description worth writing.
    if (count === 0) return;
    setHead({ title: FUNDS_TITLE, description: fundsDescription(count), path: "/funds" });
  }, [count]);

  return (
    <section className="max-w-[65ch] 2xl:max-w-none">
      <h1 className="font-display text-3xl leading-tight font-bold text-balance">
        Every mutual fund covered
      </h1>
      <p className="mt-3 text-mute-text">
        All of them, by category. Each one has a page naming the date of the month its history
        came out strongest on, and saying how much that was worth.
      </p>

      {count === 0 ? (
        <p className="mt-6 text-mute-text">
          {settled
            ? "The fund list didn’t load. Check your connection and reload the page."
            : "The fund list is still loading."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-mute-text">
            {count} funds in {groups.length} categories, listed alphabetically.
          </p>

          {/*
           * Jump links, because a thousand rows is a long scroll on a phone — as running text
           * rather than as chips. AMFI publishes seventy-odd categories, several of them long,
           * and a button apiece filled the screen before a single fund appeared.
           *
           * Some of those categories differ only in a plural ("Equity Scheme - Mid Cap Fund" and
           * "Equity Schemes - Mid Cap Fund" are both published). They are listed as published:
           * merging them is a decision about the data, which belongs in the pipeline, and a
           * directory that quietly renamed a category would disagree with the fund pages under it.
           */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-mute-text">Jump to a category</summary>
            <nav aria-label="Categories" className="mt-3 text-sm leading-relaxed text-mute-text">
              {groups.map((group, index) => (
                <span key={group.slug}>
                  {index > 0 ? ", " : null}
                  <a href={`#${group.slug}`} className="underline decoration-line underline-offset-2">
                    {group.category}
                  </a>
                </span>
              ))}
            </nav>
          </details>

          {groups.map((group) => (
            <section key={group.slug} id={group.slug} className="mt-10 scroll-mt-4">
              <h2 className="font-display text-xl font-bold text-ink">{group.category}</h2>
              <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 2xl:grid-cols-4">
                {group.funds.map((fund) => (
                  <li key={fund.code} className="text-sm leading-relaxed">
                    <Link
                      to={fundPath(fund.code)}
                      className="text-ink underline decoration-line underline-offset-2 focus-visible:ring-2 focus-visible:ring-teal"
                    >
                      {fund.name}
                      {fund.ambiguous ? ` (scheme ${fund.code})` : ""}
                    </Link>{" "}
                    <span className="text-mute-text">{fund.house}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
