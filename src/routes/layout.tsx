/**
 * The shell both routes share. The search field lives here so choosing a fund never remounts
 * it, which matters for focus and for the one orchestrated moment in Phase 6.
 *
 * The footer's date is the one thing the shell has to learn from the page inside it (PLAN.md
 * D21). A fund's own history can end before the site-wide one does — 11 of the 994 published
 * funds stop on 11 September where `meta.navAsOf` says 15 September — and a page that printed
 * the site-wide date would be claiming NAVs this fund doesn't have.
 *
 * It is read during render rather than handed up from the fund page, because a parent renders
 * before its children: a date arriving from below could only arrive in an effect, and effects
 * don't run during the prerender. That would ship every fund's HTML carrying the site-wide date
 * and then correct it after hydration — wrong for a crawler, and a visible flicker for everyone
 * else. The seeded artifact is available synchronously on both sides of hydration, so the
 * layout reads that, and the page publishes its date only for funds the cache doesn't hold.
 */
import { createContext, useContext, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Footer } from "../components/footer";
import { FundSearch } from "../components/fund-search";
import { peekFund } from "../lib/data";
import { navAsOfFromDocument } from "../lib/head";

/** A fund's own last NAV date, carried with the code it belongs to. */
export type FundNavDate = { code: number; navTo: string };

/**
 * How the fund page tells the footer which date it ended up with. The code travels with the
 * date: an effect from the fund the reader just left would otherwise land on the next fund's
 * footer for one commit, printing a date that belongs to neither page.
 */
const PublishNavDate = createContext<(fund: FundNavDate | null) => void>(() => {});

export function usePublishNavDate(): (fund: FundNavDate | null) => void {
  return useContext(PublishNavDate);
}

/** The code in `/f/119775`, or null anywhere else. Digits only, as the route itself insists. */
function fundCodeIn(pathname: string): number | null {
  const match = /^\/f\/(\d+)\/?$/.exec(pathname);
  return match?.[1] === undefined ? null : Number(match[1]);
}

export function Layout() {
  const location = useLocation();
  const onHome = location.pathname === "/";
  const [published, setPublished] = useState<FundNavDate | null>(null);

  // A deep link's fund is seeded before the first render on both sides (entry-prerender and
  // main.tsx), so the peek covers every prerendered page. What it can't cover is a fund fetched
  // after a search, which is what the published date is for.
  const code = fundCodeIn(location.pathname);
  const fundNavTo =
    code === null ? undefined : published?.code === code ? published.navTo : peekFund(code)?.navTo;

  return (
    // Below 2xl a reading column; from 2xl (large desktops) the whole width, so the fund page's
    // four columns fit the screen without a scroll (routes/fund.tsx).
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 2xl:max-w-none 2xl:px-10">
      <header className="pt-10 2xl:pt-4">
        {onHome ? (
          <h1 className="font-display text-4xl leading-tight font-bold text-balance">
            Which date should I run my SIP on?
          </h1>
        ) : null}
        {/* A search box stretched across a 4K screen is a very long empty bar. */}
        <div className={`${onHome ? "mt-6" : "pt-2"} 2xl:max-w-xl`}>
          <FundSearch autoFocus={onHome} />
        </div>
      </header>

      <main className="flex-1 py-8 2xl:py-4">
        <PublishNavDate value={setPublished}>
          <Outlet />
        </PublishNavDate>
      </main>

      {/* Outside <main>, so it keeps the contentinfo role the compliance tests look for. */}
      <Footer navAsOf={fundNavTo ?? navAsOfFromDocument()} />
    </div>
  );
}
