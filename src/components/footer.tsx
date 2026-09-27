import { Link } from "react-router";
import { formatNavDate } from "@/lib/format";
import { useTheme } from "@/lib/use-theme";

type FooterProps = {
  /** Latest NAV date in the data, as YYYY-MM-DD. Absent until data exists. */
  navAsOf?: string | undefined;
  source?: string;
};

const PRODUCT_HUNT_HREF =
  "https://www.producthunt.com/products/sip-date-planner?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-sip-date-planner";
/**
 * Product Hunt renders the badge on their side, so the theme is a parameter rather than
 * something CSS can reach: a light badge on a dark page is a white rectangle in the corner.
 * The prerendered page asks for the light one, and hydration swaps it if the reader is in dark.
 */
const productHuntSrc = (scheme: "light" | "dark") =>
  `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1258474&theme=${scheme}&t=1790100713712`;

export function Footer({ navAsOf, source = "mfapi.in" }: FooterProps) {
  const { resolved } = useTheme();

  return (
    // One line on a large desktop, where every pixel of height goes to the fund page's columns.
    <footer className="border-t border-line py-6 text-sm leading-relaxed text-mute-text 2xl:flex 2xl:flex-wrap 2xl:items-center 2xl:gap-x-6 2xl:py-2 2xl:text-xs">
      {navAsOf ? <p>NAVs up to {formatNavDate(navAsOf)}.</p> : null}
      {/*
       * The only link every page has to the directory, and the reason the fund pages are not
       * orphans: from here a crawler reaches the list of every fund, and from there each fund.
       */}
      <p className="mt-2 2xl:mt-0">
        <Link to="/funds" className="underline decoration-line underline-offset-2">
          All funds
        </Link>
      </p>
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
            src={productHuntSrc(resolved)}
            className="block h-[54px] w-[250px] 2xl:h-7 2xl:w-[130px]"
          />
        </a>
      </p>
    </footer>
  );
}
