/**
 * The shell both routes share. The search field lives here so choosing a fund never remounts
 * it, which matters for focus and for the one orchestrated moment in Phase 6.
 */
import { Outlet, useLocation } from "react-router";
import { FundSearch } from "../components/fund-search";
import { Footer } from "../components/footer";
import { navAsOfFromDocument } from "../lib/head";

export function Layout() {
  const location = useLocation();
  const onHome = location.pathname === "/";

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5">
      <header className="pt-10">
        {onHome ? (
          <h1 className="font-display text-4xl leading-tight font-bold text-balance">
            Which date should I run my SIP on?
          </h1>
        ) : null}
        <div className={onHome ? "mt-6" : "pt-2"}>
          <FundSearch autoFocus={onHome} />
        </div>
      </header>

      <main className="flex-1 py-8">
        <Outlet />
      </main>

      <Footer navAsOf={navAsOfFromDocument()} />
    </div>
  );
}
