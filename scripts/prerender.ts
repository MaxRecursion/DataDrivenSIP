/**
 * Writes a static page per fund, plus the home page, the directory, robots.txt and the sitemap
 * (PLAN.md D12, §6.2, and the 2026-09-27 SEO amendment).
 *
 * Link-preview crawlers don't run JavaScript, so og tags have to be in the HTML. The same
 * pass inlines the fund's own data and the data version, which is what lets a deep link paint
 * without a request. This is build-time generation: no server runs at request time.
 *
 * The head tags, the structured data, the sitemap and robots.txt are all built by
 * `src/lib/seo.ts`, which is pure and tested, rather than assembled from string literals here —
 * a title format that drifts between what the build writes and what the running app sets is a
 * bug no one sees until a share preview contradicts the tab.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FundArtifact, IndexRow, Meta } from "../shared/artifacts";
import { pickAnswer } from "../src/lib/answer";
import {
  FUNDS_TITLE,
  HOME_DESCRIPTION,
  HOME_TITLE,
  breadcrumbJsonLd,
  directoryJsonLd,
  escapeAttribute,
  escapeJson,
  faqJsonLd,
  fundDescription,
  fundJsonLd,
  fundTitle,
  fundsDescription,
  headTags,
  sharedNames,
  DEFAULT_ORIGIN,
  robotsTxt,
  sitemapXml,
  websiteJsonLd,
  type SitemapEntry,
} from "../src/lib/seo";
import { buildDirectory, directoryListing } from "../src/lib/directory";
import { HOME_FAQ } from "../src/lib/faq";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const dataDir = join(dist, "data");

type Renderer = (
  path: string,
  options: { dataVersion?: string; navAsOf?: string; fund?: FundArtifact; index?: IndexRow[] },
) => string;


/**
 * The stylesheet, inlined into every page rather than linked (PLAN.md section 9: LCP < 1.2s).
 *
 * Measured with real network-and-CPU throttling (--throttling-method=devtools, matching
 * Lighthouse's own default profile), not just Lighthouse's post-hoc simulation: the linked
 * <link rel="stylesheet"> was 99% of a 1432 ms LCP, all of it "render delay" -- the extra
 * round trip to fetch a render-blocking file, however small, before the browser can paint
 * anything. mainthread-work-breakdown and total-blocking-time: 0 ruled out script execution;
 * render-blocking-resources named the CSS file directly, at 726 ms wasted.
 *
 * At 4.6 KB gzipped this duplicates into every one of the 995 prerendered pages rather than
 * being fetched once and cached -- the trade this makes on purpose. A fresh document load (a
 * search result, a shared link, a crawler) is the case LCP measures and the one the whole
 * prerender exists for; browsing between funds inside the running app is client-side routing
 * and never re-fetches a document at all, so it pays nothing extra either way.
 */
function inlineStylesheet(template: string, css: string): string {
  if (/<\/style/i.test(css)) {
    throw new Error("prerender: built CSS contains a literal </style -- cannot inline safely");
  }
  const link = /<link[^>]*rel="stylesheet"[^>]*>/;
  if (!link.test(template)) throw new Error('prerender: no <link rel="stylesheet"> in the built index.html');
  return template.replace(link, () => `<style>${css}</style>`);
}

function page(
  template: string,
  parts: {
    path: string;
    markup: string;
    title: string;
    description: string;
    canonical: string;
    meta: Meta;
    jsonLd?: string[];
    fund?: FundArtifact;
    index?: IndexRow[];
  },
): string {
  const head = [
    `<meta name="data-version" content="${escapeAttribute(parts.meta.dataVersion)}" />`,
    `<meta name="nav-as-of" content="${escapeAttribute(parts.meta.navAsOf)}" />`,
    headTags({
      title: parts.title,
      description: parts.description,
      canonical: parts.canonical,
      ...(parts.jsonLd ? { jsonLd: parts.jsonLd } : {}),
    }),
  ].join("\n    ");

  // The page's own data, inlined so it paints without a request: a fund's artifact on a fund
  // page, and the whole index on the directory, which is a thousand links it cannot render
  // without.
  const inline = [
    parts.fund
      ? `<script type="application/json" id="fund-data">${escapeJson(JSON.stringify(parts.fund))}</script>`
      : "",
    parts.index
      ? `<script type="application/json" id="index-data">${escapeJson(JSON.stringify(parts.index))}</script>`
      : "",
  ]
    .filter(Boolean)
    .map((tag) => `\n    ${tag}`)
    .join("");

  let html = template;
  // The path, not just a flag: Workers answers an unknown path with this same file, and only
  // the page built for the path being loaded can be hydrated onto.
  html = replaceOnce(
    html,
    '<html lang="en-IN">',
    `<html lang="en-IN" data-prerendered="${escapeAttribute(parts.path)}">`,
    "mark the page prerendered",
  );
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeAttribute(parts.title)}</title>`, "set the title");
  html = replaceOnce(html, /<meta\s+name="description"[^>]*>/, "", "drop the template description");
  html = replaceOnce(html, "</head>", `  ${head}${inline}\n  </head>`, "add the head tags");
  html = replaceOnce(html, '<div id="root"></div>', `<div id="root">${parts.markup}</div>`, "inline the markup");
  return html;
}

/**
 * A replacement that quietly matched nothing would ship a page with no markup and no data
 * version — it would still look like a successful build, so insist instead. The replacement
 * is passed as a function because `$&` and friends inside a fund name or the inlined JSON
 * would otherwise be read as patterns.
 */
function replaceOnce(html: string, find: string | RegExp, insert: string, what: string): string {
  // Test for the match rather than compare the result: the home page's title is already the
  // one being written, and an unchanged string there is correct rather than a failure.
  const found = typeof find === "string" ? html.includes(find) : find.test(html);
  if (!found) throw new Error(`prerender: could not ${what} — index.html changed shape`);
  return html.replace(find, () => insert);
}

async function main(): Promise<void> {
  const built = await readFile(join(dist, "index.html"), "utf8");
  const stylesheetHref = built.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1];
  if (!stylesheetHref) throw new Error("prerender: could not find the built stylesheet's href");
  const css = await readFile(join(dist, stylesheetHref.replace(/^\//, "")), "utf8");
  const template = inlineStylesheet(built, css);
  const meta = JSON.parse(await readFile(join(dataDir, "meta.json"), "utf8")) as Meta;
  const { render } = (await import(pathToFileURL(join(root, ".prerender/entry-prerender.js")).href)) as {
    render: Renderer;
  };

  // The canonical origin only matters for og:url; a preview deployment still renders.
  const origin = process.env.SITE_ORIGIN ?? DEFAULT_ORIGIN;
  const index = JSON.parse(await readFile(join(dataDir, "index.json"), "utf8")) as IndexRow[];

  // Every URL that should be crawled, collected as the pages are written. `lastmod` is the NAV
  // date the figures came from rather than the build clock: a nightly build that changed nothing
  // must not ask for 1003 pages to be recrawled.
  const sitemap: SitemapEntry[] = [
    { path: "/", lastmod: meta.navAsOf, changefreq: "daily", priority: "1.0" },
    { path: "/funds", lastmod: meta.navAsOf, changefreq: "weekly", priority: "0.8" },
  ];

  await writeFile(
    join(dist, "index.html"),
    page(template, {
      path: "/",
      markup: render("/", { dataVersion: meta.dataVersion, navAsOf: meta.navAsOf }),
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      canonical: `${origin}/`,
      meta,
      jsonLd: [websiteJsonLd(origin), faqJsonLd(HOME_FAQ)],
    }),
  );

  // The directory, and the only page that gets the whole index inlined — it is a thousand links,
  // and a crawler has to read them in the HTML rather than after a fetch it will never make.
  await writeFile(
    join(dist, "funds.html"),
    page(template, {
      path: "/funds",
      markup: render("/funds", { dataVersion: meta.dataVersion, navAsOf: meta.navAsOf, index }),
      title: FUNDS_TITLE,
      description: fundsDescription(index.length),
      canonical: `${origin}/funds`,
      meta,
      index,
      jsonLd: [
        directoryJsonLd(origin, directoryListing(buildDirectory(index))),
        breadcrumbJsonLd(origin, [
          { name: "Home", path: "/" },
          { name: "All funds", path: "/funds" },
        ]),
      ],
    }),
  );

  const fundsDir = join(dataDir, meta.dataVersion, "funds");
  const files = await readdir(fundsDir);
  await mkdir(join(dist, "f"), { recursive: true });

  // AMFI publishes a handful of schemes under a name it shares with another scheme. Those pages
  // name their scheme code so two URLs don't go out under one title (see sharedNames).
  const collisions = sharedNames(index);

  let written = 0;
  for (const file of files) {
    const fund = JSON.parse(await readFile(join(fundsDir, file), "utf8")) as FundArtifact;
    // The same pick the page itself makes, so the title and the description state this fund's
    // real answer rather than a sentence 1001 pages share.
    const answer = pickAnswer(fund);
    const ambiguous = collisions.has(fund.name);
    const title = fundTitle(fund, answer, ambiguous);
    const description = fundDescription(fund, answer, ambiguous);
    const html = page(template, {
      path: `/f/${fund.code}`,
      markup: render(`/f/${fund.code}`, { dataVersion: meta.dataVersion, navAsOf: meta.navAsOf, fund }),
      title,
      description,
      canonical: `${origin}/f/${fund.code}`,
      meta,
      fund,
      jsonLd: [
        fundJsonLd(origin, fund, { title, description }),
        breadcrumbJsonLd(origin, [
          { name: "Home", path: "/" },
          { name: "All funds", path: "/funds" },
          { name: fund.name, path: `/f/${fund.code}` },
        ]),
      ],
    });
    // Flat files: Workers serves f/119775.html at /f/119775 with no redirect.
    await writeFile(join(dist, "f", `${fund.code}.html`), html);
    sitemap.push({ path: `/f/${fund.code}`, lastmod: fund.navTo, changefreq: "weekly", priority: "0.7" });
    written++;
  }

  await writeFile(join(dist, "sitemap.xml"), sitemapXml(origin, sitemap));
  await writeFile(join(dist, "robots.txt"), robotsTxt(origin));

  console.log(
    `prerendered ${written} fund pages, the directory and the home page for ${meta.dataVersion}; ` +
      `sitemap lists ${sitemap.length} URLs at ${origin}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
