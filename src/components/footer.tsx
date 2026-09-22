import { formatNavDate } from "@/lib/format";

type FooterProps = {
  /** Latest NAV date in the data, as YYYY-MM-DD. Absent until data exists. */
  navAsOf?: string | undefined;
  source?: string;
};

const PRODUCT_HUNT_HREF =
  "https://www.producthunt.com/products/sip-date-planner?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-sip-date-planner";
const PRODUCT_HUNT_SRC =
  "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1258474&theme=light&t=1790100713712";

export function Footer({ navAsOf, source = "mfapi.in" }: FooterProps) {
  return (
    // One line on a large desktop, where every pixel of height goes to the fund page's columns.
    <footer className="border-t border-line py-6 text-sm leading-relaxed text-mute-text 2xl:flex 2xl:flex-wrap 2xl:items-center 2xl:gap-x-6 2xl:py-3 2xl:text-xs">
      {navAsOf ? <p>NAVs up to {formatNavDate(navAsOf)}.</p> : null}
      <p className="mt-2 max-w-[65ch] 2xl:mt-0 2xl:max-w-none">
        Educational tool. Not investment advice. Past performance does not indicate future
        results. Data from AMFI published NAVs via {source}.
      </p>
      <p className="mt-2 max-w-[65ch] 2xl:mt-0 2xl:max-w-none">
        Not a recommendation to buy, sell or hold any scheme. Not registered with SEBI. Not
        affiliated with AMFI, mfapi.in or any fund house.
      </p>
      <p className="mt-4 2xl:mt-0 2xl:ml-auto">
        <a href={PRODUCT_HUNT_HREF} target="_blank" rel="noopener noreferrer">
          <img
            alt="SIP Date Planner - One SIP date per fund, with an honest noise verdict | Product Hunt"
            width={250}
            height={54}
            decoding="async"
            loading="lazy"
            src={PRODUCT_HUNT_SRC}
            className="block h-[54px] w-[250px] 2xl:h-7 2xl:w-[130px]"
          />
        </a>
      </p>
    </footer>
  );
}
