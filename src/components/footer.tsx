import { formatNavDate } from "@/lib/format";

type FooterProps = {
  /** Latest NAV date in the data, as YYYY-MM-DD. Absent until data exists. */
  navAsOf?: string | undefined;
  source?: string;
};

export function Footer({ navAsOf, source = "mfapi.in" }: FooterProps) {
  return (
    // One line on a large desktop, where every pixel of height goes to the fund page's columns.
    <footer className="border-t border-line py-6 text-sm leading-relaxed text-mute-text 2xl:flex 2xl:flex-wrap 2xl:gap-x-6 2xl:py-3 2xl:text-xs">
      {navAsOf ? <p>NAVs up to {formatNavDate(navAsOf)}.</p> : null}
      <p className="mt-2 max-w-[65ch] 2xl:mt-0 2xl:max-w-none">
        Educational tool. Not investment advice. Past performance does not indicate future
        results. Data from AMFI published NAVs via {source}.
      </p>
      <p className="mt-2 max-w-[65ch] 2xl:mt-0 2xl:max-w-none">
        Not a recommendation to buy, sell or hold any scheme. Not registered with SEBI. Not
        affiliated with AMFI, mfapi.in or any fund house.
      </p>
    </footer>
  );
}
