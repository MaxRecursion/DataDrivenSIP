/**
 * Everything a crawler reads: titles, descriptions, the head tags, the structured data, the
 * sitemap and robots.txt.
 *
 * Pure string building, no DOM and no I/O, for the same reason `theme.ts` is: `scripts/prerender.ts`
 * has to produce exactly what the running app would, and a module that touches a browser global
 * can't be imported by a Node script. The prerender writes these into 1003 static files; the app
 * reuses the same title and description functions when a reader navigates client-side, so the tab
 * and the shared link never disagree with the page that was crawled.
 *
 * The honest limits of this file, written down so nobody expects more of it:
 *
 * - Markup cannot win a head term. "Mutual fund", "investment" and "SIP" are held by sites with
 *   years of links and brand behind them, and no combination of tags changes that. What these
 *   pages can win is the question they actually answer, which nobody else has 1001 pages of:
 *   which date of the month to run a SIP in one named fund. So every title and description names
 *   the fund and states that fund's own answer, rather than repeating a generic phrase 1001 times.
 * - A description that oversells gets rewritten by Google and disappoints the reader who clicks.
 *   These say the date and the verdict, including when the verdict is "noise" — which is the
 *   honest answer for most funds, and the one the product exists to give.
 */
import type { FundArtifact, IndexRow } from "../../shared/artifacts";
import type { Answer } from "./answer";
import { formatNavDate, formatPp, ordinal } from "./format";

export const SITE_NAME = "Tithi";
/** What the site was called before, and still what people type: kept as the WebSite's other name. */
export const SITE_ALTERNATE_NAME = "SIP Date Planner";
/** The one social-preview image every page shares, 1200x630 in `public/`. */
export const OG_IMAGE_PATH = "/og-image.png";
export const OG_IMAGE_ALT = "Tithi: which date of the month to run your mutual fund SIP";
export const ROBOTS_INDEX = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const ROBOTS_NOINDEX = "noindex, follow";

export const DEFAULT_ORIGIN = "https://sip-date-planner.kulkarniakshay1989.workers.dev";

/** The one sentence the site is about, for the home page and as a fallback. */
export const SITE_DESCRIPTION =
  "Which date of the month to run your mutual fund SIP, from the full published NAV history " +
  "of 1001 Indian funds — with an honest read on how little the date usually matters.";

// -----------------------------------------------------------------------------------------------
// Escaping

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** `</script>` inside JSON would end the tag early; so would a lone `<`. */
export function escapeJson(value: string): string {
  return value.replace(/</g, "\\u003c");
}

/** The five XML predefined entities, for sitemap URLs. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// -----------------------------------------------------------------------------------------------
// Titles and descriptions

/**
 * The names AMFI publishes for more than one scheme code.
 *
 * Six of the 1001 pages are affected today: the Sundaram Small Cap, Kotak Aggressive Hybrid and
 * Axis Children's funds each appear twice, under a name that doesn't say which of the two it is
 * (the lock-in variants, typically). They are genuinely different schemes with different NAVs,
 * so neither page can be dropped or pointed at the other with a canonical — but two URLs under
 * one title, one description and near-identical figures is the textbook duplicate-content case,
 * and the usual outcome is that Google keeps one and quietly discards the other.
 *
 * So the ones that collide say which scheme they are, and the ones that don't stay clean. The
 * set is computed from the published index at build time rather than hard-coded, because the
 * data is rebuilt nightly and tomorrow's collisions are not today's.
 */
export function sharedNames(rows: readonly IndexRow[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const [, name] of rows) {
    if (seen.has(name)) shared.add(name);
    seen.add(name);
  }
  return shared;
}

/** How a fund is named in a title or a description: its own name, or that plus its scheme code. */
export function displayName(fund: Pick<FundArtifact, "name" | "code">, disambiguate = false): string {
  return disambiguate ? `${fund.name} (scheme ${fund.code})` : fund.name;
}

/**
 * A fund page's title.
 *
 * The fund's name comes first because that is what someone searches — they type the fund, not the
 * tool — and the answer follows it, so the result in the list already tells them the date. Names
 * run long ("Kotak Mid Cap Fund - Direct Plan - Growth"), and Google truncates a title around 60
 * characters, so the site name is dropped rather than pushing the answer out of sight.
 *
 * "Best" is used of a DAY, which is the question the product answers and is allowed; of a fund it
 * is banned everywhere, and `scripts/check-rules.ts` is what keeps that true.
 */
export function fundTitle(
  fund: Pick<FundArtifact, "name" | "code">,
  answer: Answer,
  disambiguate = false,
): string {
  const head = `${displayName(fund, disambiguate)}: SIP on the ${ordinal(answer.date)}`;
  const full = `${head} — ${SITE_NAME}`;
  // Measured on the finished title, not on the part before the suffix — the suffix is nineteen
  // characters, which is the difference between a title that fits and one cut off mid-answer.
  return full.length > 60 ? head : full;
}

/**
 * A fund page's description: the date, what the date was worth, and how long a history said so.
 *
 * Every one of the 1001 is different because every fund's figures are, which is the whole reason
 * these pages are worth indexing at all. A description repeated across 1001 URLs is a duplicate
 * content signal, not a keyword win.
 */
export function fundDescription(
  fund: Pick<FundArtifact, "name" | "code" | "spreadPp" | "instalments" | "verdict" | "trimmedFrom">,
  answer: Answer,
  disambiguate = false,
): string {
  // The page's own chip says Noise, Thin edge or Date effect (`verdictLabel`). The search result
  // uses the same words, so what someone reads before clicking is what they find after.
  const verdict =
    fund.verdict === "noise"
      ? "close enough that the date is noise"
      : fund.verdict === "marginal"
        ? "a thin edge"
        : "a date effect in its history";
  // A trimmed fund's series starts where its usable history does, not where the fund does
  // (PLAN.md D21), and CLAUDE.md forbids presenting a cut series as the fund's whole life.
  const history = fund.trimmedFrom
    ? `across ${fund.instalments} instalments of NAV history from ` +
      `${formatNavDate(fund.trimmedFrom)}, where its usable series begins`
    : `across ${fund.instalments} instalments of published NAV history`;
  return (
    `The ${ordinal(answer.date)} has been the strongest SIP date for ${displayName(fund, disambiguate)}, ` +
    `${history}. All 28 dates sit within ${formatPp(fund.spreadPp)} of XIRR — ${verdict}.`
  );
}

export const HOME_TITLE = `${SITE_NAME} — which date to run your mutual fund SIP`;
export const HOME_DESCRIPTION = SITE_DESCRIPTION;

export const FUNDS_TITLE = `All funds — ${SITE_NAME}`;
export function fundsDescription(count: number): string {
  return (
    `Every one of the ${count} Indian mutual funds covered here, by category. ` +
    `Each one has its own page naming the SIP date with the highest full-history XIRR.`
  );
}

// -----------------------------------------------------------------------------------------------
// Head tags

export type HeadTags = {
  title: string;
  description: string;
  canonical: string;
  /** JSON-LD blocks, already stringified. */
  jsonLd?: string[];
};

/**
 * The head of a prerendered page, as one string.
 *
 * `robots` is stated rather than left to the default: `max-image-preview:large` and
 * `max-snippet:-1` are opt-ins, and a page that doesn't ask for them gets the smaller treatment.
 * Twitter's card tags are separate from Open Graph's on purpose — X reads `twitter:*` first and
 * falls back to `og:*`, but several other readers only understand one of the two.
 */
export function headTags(tags: HeadTags): string {
  const attribute = escapeAttribute;
  const image = `${new URL(tags.canonical).origin}${OG_IMAGE_PATH}`;
  const lines = [
    `<meta name="description" content="${attribute(tags.description)}" />`,
    `<meta name="robots" content="${ROBOTS_INDEX}" />`,
    `<link rel="canonical" href="${attribute(tags.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${attribute(SITE_NAME)}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:title" content="${attribute(tags.title)}" />`,
    `<meta property="og:description" content="${attribute(tags.description)}" />`,
    `<meta property="og:url" content="${attribute(tags.canonical)}" />`,
    `<meta property="og:image" content="${attribute(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${attribute(OG_IMAGE_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${attribute(image)}" />`,
    `<meta name="twitter:title" content="${attribute(tags.title)}" />`,
    `<meta name="twitter:description" content="${attribute(tags.description)}" />`,
  ];

  for (const block of tags.jsonLd ?? []) {
    lines.push(`<script type="application/ld+json">${escapeJson(block)}</script>`);
  }

  return lines.join("\n    ");
}

// -----------------------------------------------------------------------------------------------
// Structured data
//
// Only what the page actually shows. Structured data describing something a reader can't see is
// against Google's own guidelines and is the fastest way to lose rich results altogether — so
// there is no AggregateRating here, no Review, and no FAQPage on a page without an FAQ.

/**
 * The site itself.
 *
 * Deliberately without a `SearchAction`. It is the obvious thing to add — it is what can earn a
 * sitelinks search box — but it declares a URL that takes a query string and returns results for
 * it, and this site has no such URL: the search box is client-side and CLAUDE.md keeps state out
 * of the URL. Claiming one would be describing a page that doesn't exist, which is the kind of
 * thing that costs a site its rich results rather than earning it any.
 */
export function websiteJsonLd(origin: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: `${origin}/`,
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
  });
}

/** Where this page sits, which is what puts a breadcrumb line under the result instead of a URL. */
export function breadcrumbJsonLd(origin: string, trail: ReadonlyArray<{ name: string; path: string }>): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: `${origin}${step.path}`,
    })),
  });
}

/**
 * The home page's questions and answers, which are on the page in full. Google restricted FAQ
 * rich results to a handful of site types in 2023, so this is not a bet on a rich snippet — it is
 * a correct description of a page that really is a set of questions and answers.
 */
export function faqJsonLd(entries: ReadonlyArray<{ question: string; answer: string }>): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  });
}

/**
 * A fund page, as the thing it is: a page about one named scheme, derived from a dated source.
 * `dateModified` is the last NAV the figures were computed from, not the build clock — a build
 * that changed nothing should not claim the page is newer than its data.
 */
export function fundJsonLd(
  origin: string,
  fund: Pick<FundArtifact, "code" | "name" | "house" | "category" | "navTo">,
  tags: { title: string; description: string },
): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: tags.title,
    description: tags.description,
    url: `${origin}/f/${fund.code}`,
    inLanguage: "en-IN",
    dateModified: fund.navTo,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${origin}/` },
    about: {
      "@type": "FinancialProduct",
      name: fund.name,
      category: fund.category,
      provider: { "@type": "Organization", name: fund.house },
    },
  });
}

/**
 * The directory, as a list of the pages it links to: in the order the page lists them, under the
 * names the page prints, so the markup describes the page rather than the index file behind it.
 * The caller passes `buildDirectory`'s output flattened — this module can't import it, because
 * `directory.ts` imports `sharedNames` from here.
 *
 * Capped at a hundred: a thousand-item list helps nobody, and `numberOfItems` still says how many
 * there are.
 */
export function directoryJsonLd(
  origin: string,
  listed: ReadonlyArray<{ code: number; name: string }>,
  limit = 100,
): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: FUNDS_TITLE,
    description: fundsDescription(listed.length),
    url: `${origin}/funds`,
    inLanguage: "en-IN",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listed.length,
      itemListElement: listed.slice(0, limit).map((fund, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: fund.name,
        url: `${origin}/f/${fund.code}`,
      })),
    },
  });
}

// -----------------------------------------------------------------------------------------------
// robots.txt and the sitemap

/**
 * Crawling is allowed everywhere. The data files are excluded from the index by an
 * `X-Robots-Tag` header in `public/_headers` rather than by a `Disallow` here, because a
 * disallowed URL is one Google never fetches and so never sees the noindex on — a URL blocked in
 * robots.txt can still be listed, without its content. Letting it be fetched and told no is the
 * combination that actually keeps JSON out of the results.
 */
export function robotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export type SitemapEntry = {
  /** Path with a leading slash. */
  path: string;
  /** YYYY-MM-DD. */
  lastmod?: string;
  priority?: string;
  changefreq?: "daily" | "weekly" | "monthly";
};

/**
 * The sitemap, which for this site is not a nicety: the only route to a fund page inside the app
 * is a search box that needs JavaScript, so before this existed a crawler could reach the home
 * page and nothing else. The directory page fixes that for readers and for link equity; this
 * fixes discovery, and states when each page's data last changed so a nightly build doesn't ask
 * for 1001 pages to be recrawled when only the NAV date moved.
 *
 * 50,000 URLs and 50 MB uncompressed is the protocol's limit and 1003 is nowhere near it, so one
 * file is enough and no index file is needed.
 */
export function sitemapXml(origin: string, entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const parts = [`    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`];
    if (entry.lastmod) parts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
    if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);
    return `  <url>\n${parts.join("\n")}\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
