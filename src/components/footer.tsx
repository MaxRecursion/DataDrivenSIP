import { formatNavDate } from "@/lib/format";

type FooterProps = {
  /** Latest NAV date in the data, as YYYY-MM-DD. Omitted until data exists. */
  navAsOf?: string;
  source?: string;
};

export function Footer({ navAsOf, source = "mfapi.in" }: FooterProps) {
  return (
    <footer className="border-t border-line py-6 text-sm leading-relaxed text-mute-text">
      {navAsOf ? <p>NAVs up to {formatNavDate(navAsOf)}.</p> : null}
      <p className="mt-2 max-w-[65ch]">
        Educational tool. Not investment advice. Past performance does not indicate future
        results. Data from AMFI published NAVs via {source}.
      </p>
      <p className="mt-2 max-w-[65ch]">
        Not a recommendation to buy, sell or hold any scheme. Not registered with SEBI. Not
        affiliated with AMFI, mfapi.in or any fund house.
      </p>
    </footer>
  );
}
