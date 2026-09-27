/**
 * What a crawler reads, checked the way the rest of this project checks copy: against real
 * published funds, not fixtures shaped to pass.
 *
 * The two failures worth guarding against here are both silent. A title or description repeated
 * across 1001 URLs is a duplicate-content signal rather than a keyword win, and it would look
 * completely normal in a diff — so uniqueness is asserted across every published fund. And
 * structured data that describes something the page doesn't show is against Google's guidelines
 * and costs a site its rich results, so the FAQ markup is checked against the FAQ the page
 * actually renders.
 */
import { describe, expect, it } from "vitest";
import meta from "../../public/data/meta.json";
import type { FundArtifact, IndexRow } from "../../shared/artifacts";
import { pickAnswer } from "./answer";
import { HOME_FAQ } from "./faq";
import {
  DEFAULT_ORIGIN,
  FUNDS_TITLE,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_NAME,
  breadcrumbJsonLd,
  directoryJsonLd,
  escapeAttribute,
  escapeJson,
  escapeXml,
  faqJsonLd,
  fundDescription,
  fundJsonLd,
  fundTitle,
  fundsDescription,
  headTags,
  robotsTxt,
  sharedNames,
  sitemapXml,
  websiteJsonLd,
} from "./seo";

const ORIGIN = "https://example.test";

/**
 * Real artifacts through Vite's glob, the idiom `copy.test.ts` established: this file belongs to
 * the app project, which carries no Node types on purpose, so a test that reaches for the
 * filesystem doesn't compile. The version directory stays a wildcard and the lookup goes through
 * meta.json, so the next pipeline run moves the data without breaking the suite.
 *
 * The golden fixture, a short history, a trimmed fund, a long name and a marginal verdict.
 */
const artifacts = import.meta.glob<FundArtifact>(
  [
    "../../public/data/*/funds/119775.json",
    "../../public/data/*/funds/151713.json",
    "../../public/data/*/funds/145137.json",
    "../../public/data/*/funds/148507.json",
    "../../public/data/*/funds/103490.json",
  ],
  { eager: true, import: "default" },
);

const CODES = [119775, 151713, 145137, 148507, 103490];

function fundAt(code: number): FundArtifact {
  const artifact = artifacts[`../../public/data/${meta.dataVersion}/funds/${code}.json`];
  if (!artifact) throw new Error(`No published artifact for ${code} at ${meta.dataVersion}`);
  return artifact;
}

describe("escaping", () => {
  it("closes the holes a fund name could open", () => {
    expect(escapeAttribute('A & B "C" <D>')).toBe("A &amp; B &quot;C&quot; &lt;D>");
    expect(escapeJson('</script>')).toBe("\\u003c/script>");
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});

describe("fund titles and descriptions", () => {
  it("names the fund first and its own answer second", () => {
    const fund = fundAt(119775);
    const answer = pickAnswer(fund);
    const title = fundTitle(fund, answer);
    expect(title.startsWith(fund.name)).toBe(true);
    expect(title).toContain("SIP on the");
    expect(fundDescription(fund, answer)).toContain(fund.name);
  });

  it("drops the site name rather than pushing the answer past the truncation point", () => {
    // Google truncates a title around 60 characters, and on a real Indian scheme name the fund
    // plus the answer has already spent them. The invariant, either way round: the site name is
    // only ever there when the whole title still fits.
    for (const code of CODES) {
      const fund = fundAt(code);
      const title = fundTitle(fund, pickAnswer(fund));
      expect(title.startsWith(fund.name), title).toBe(true);
      if (title.includes(SITE_NAME)) expect(title.length, title).toBeLessThanOrEqual(60);
    }

    // Every published name is long, so the branch that keeps the suffix needs a short one to be
    // exercised at all.
    const short = fundTitle({ name: "A Fund", code: 1 }, pickAnswer(fundAt(119775)));
    expect(short).toContain(SITE_NAME);
    expect(short.length).toBeLessThanOrEqual(60);
  });

  it("states the verdict plainly, noise included", () => {
    for (const code of CODES) {
      const fund = fundAt(code);
      const description = fundDescription(fund, pickAnswer(fund));
      if (fund.verdict === "noise") expect(description).toContain("noise");
      expect(description).toContain(`${fund.instalments} instalments`);
    }
  });

  it("names the scheme code only when another fund publishes under the same name", () => {
    // AMFI ships a few schemes under a name shared with another scheme code. Two URLs under one
    // title is the duplicate-content case, so those pages say which scheme they are — and the
    // 995 that don't collide are left clean, because a code in a title helps nobody otherwise.
    const fund = fundAt(119775);
    const answer = pickAnswer(fund);
    expect(fundTitle(fund, answer, false)).not.toContain("scheme 119775");
    expect(fundTitle(fund, answer, true)).toContain("(scheme 119775)");
    expect(fundDescription(fund, answer, true)).toContain("(scheme 119775)");
    expect(fundTitle(fund, answer, true)).not.toBe(fundTitle(fund, answer, false));
  });

  it("finds the names more than one scheme is published under", () => {
    const rows: IndexRow[] = [
      [1, "Twice Over Fund", "A", "Equity"],
      [2, "Twice Over Fund", "A", "Equity"],
      [3, "Only Once Fund", "A", "Equity"],
    ];
    expect([...sharedNames(rows)]).toEqual(["Twice Over Fund"]);
    expect(sharedNames([]).size).toBe(0);
  });

  it("differs between funds, so 1001 pages don't share one sentence", () => {
    // The sweep over every published fund is in tests/rules/seo-corpus.test.ts, which can read
    // the whole data directory. This is the same property on the sample.
    const titles = new Set(CODES.map((code) => fundTitle(fundAt(code), pickAnswer(fundAt(code)))));
    const descriptions = new Set(
      CODES.map((code) => fundDescription(fundAt(code), pickAnswer(fundAt(code)))),
    );
    expect(titles.size).toBe(CODES.length);
    expect(descriptions.size).toBe(CODES.length);
  });

  it("keeps descriptions in the range a search result will actually show", () => {
    for (const code of CODES) {
      const fund = fundAt(code);
      const description = fundDescription(fund, pickAnswer(fund));
      expect(description.length).toBeGreaterThan(80);
      expect(description.length).toBeLessThan(320);
    }
  });
});

describe("head tags", () => {
  const tags = headTags({
    title: 'A & B "quoted"',
    description: "One line.",
    canonical: `${ORIGIN}/f/1`,
  });

  it("escapes every value it interpolates", () => {
    expect(tags).toContain('content="A &amp; B &quot;quoted&quot;"');
    expect(tags).not.toContain('content="A & B "quoted""');
  });

  it("asks for the treatment a page has to opt into", () => {
    // max-snippet and max-image-preview are opt-ins; a page that stays silent gets less.
    expect(tags).toContain("max-image-preview:large");
    expect(tags).toContain("max-snippet:-1");
    expect(tags).toContain("index, follow");
  });

  it("carries a canonical, Open Graph and a Twitter card", () => {
    expect(tags).toContain(`<link rel="canonical" href="${ORIGIN}/f/1" />`);
    expect(tags).toContain('property="og:url"');
    expect(tags).toContain('property="og:site_name"');
    expect(tags).toContain('property="og:locale" content="en_IN"');
    expect(tags).toContain('name="twitter:card"');
  });

  it("embeds JSON-LD so a fund name can't end the script tag", () => {
    const withLd = headTags({
      title: "t",
      description: "d",
      canonical: `${ORIGIN}/`,
      jsonLd: [JSON.stringify({ name: "</script><img>" })],
    });
    expect(withLd).toContain('<script type="application/ld+json">');
    expect(withLd.toLowerCase()).not.toContain("</script><img>");
  });
});

describe("structured data", () => {
  const parse = (block: string): Record<string, unknown> => JSON.parse(block) as Record<string, unknown>;

  it("declares the site without claiming a search endpoint it doesn't have", () => {
    const site = parse(websiteJsonLd(ORIGIN));
    expect(site["@type"]).toBe("WebSite");
    expect(site.url).toBe(`${ORIGIN}/`);
    // The obvious thing to add, and wrong here: there is no URL that takes a query string.
    expect(site.potentialAction).toBeUndefined();
  });

  it("describes a fund page as the page it is, dated by its data rather than the build", () => {
    const fund = fundAt(119775);
    const answer = pickAnswer(fund);
    const block = parse(fundJsonLd(ORIGIN, fund, { title: fundTitle(fund, answer), description: "d" }));
    expect(block["@type"]).toBe("WebPage");
    expect(block.url).toBe(`${ORIGIN}/f/${fund.code}`);
    expect(block.dateModified).toBe(fund.navTo);
    expect((block.about as { name: string }).name).toBe(fund.name);
  });

  it("numbers a breadcrumb trail from one", () => {
    const trail = parse(
      breadcrumbJsonLd(ORIGIN, [
        { name: "Home", path: "/" },
        { name: "All funds", path: "/funds" },
      ]),
    );
    const items = trail.itemListElement as Array<{ position: number; item: string }>;
    expect(items.map((item) => item.position)).toEqual([1, 2]);
    expect(items[1]?.item).toBe(`${ORIGIN}/funds`);
  });

  it("marks up exactly the questions the page renders", () => {
    const faq = parse(faqJsonLd(HOME_FAQ));
    const questions = (faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>).map(
      (entry) => entry.name,
    );
    expect(questions).toEqual(HOME_FAQ.map((entry) => entry.question));
    expect(faq["@type"]).toBe("FAQPage");
  });

  it("caps the directory list rather than describing a thousand items", () => {
    const rows: IndexRow[] = Array.from({ length: 300 }, (_, i) => [i, `Fund ${i}`, "House", "Category"]);
    const block = parse(directoryJsonLd(ORIGIN, rows));
    const list = block.mainEntity as { numberOfItems: number; itemListElement: unknown[] };
    expect(list.numberOfItems).toBe(300);
    expect(list.itemListElement).toHaveLength(100);
  });
});

describe("robots.txt", () => {
  const text = robotsTxt(ORIGIN);

  it("allows the crawl and points at the sitemap absolutely", () => {
    expect(text).toContain("User-agent: *");
    expect(text).toContain("Allow: /");
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("does not disallow the data, which is what would keep the noindex from being seen", () => {
    expect(text).not.toContain("Disallow: /data");
  });
});

describe("the sitemap", () => {
  const xml = sitemapXml(ORIGIN, [
    { path: "/", lastmod: "2026-09-25", changefreq: "daily", priority: "1.0" },
    { path: "/f/119775", lastmod: "2026-09-25" },
  ]);

  it("is a well-formed urlset with absolute locations", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${ORIGIN}/f/119775</loc>`);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("leaves out what it wasn't given rather than guessing", () => {
    const entry = xml.slice(xml.indexOf("/f/119775"));
    expect(entry).not.toContain("<priority>");
  });

  it("escapes a location, since an unescaped ampersand makes the file unparseable", () => {
    expect(sitemapXml(ORIGIN, [{ path: "/a?b=1&c=2" }])).toContain("&amp;c=2");
  });
});

describe("the site's own copy", () => {
  it("has a title and description in the length a result will show", () => {
    expect(HOME_TITLE.length).toBeLessThanOrEqual(70);
    expect(HOME_DESCRIPTION.length).toBeGreaterThan(80);
    expect(HOME_DESCRIPTION.length).toBeLessThan(320);
    expect(FUNDS_TITLE).toContain(SITE_NAME);
    expect(fundsDescription(1001)).toContain("1001");
  });

  it("ships a default origin that is absolute, so a canonical is never relative", () => {
    expect(DEFAULT_ORIGIN.startsWith("https://")).toBe(true);
    expect(DEFAULT_ORIGIN.endsWith("/")).toBe(false);
  });

  it("asks and answers every question in full, so the markup describes visible content", () => {
    expect(HOME_FAQ.length).toBeGreaterThanOrEqual(5);
    for (const entry of HOME_FAQ) {
      expect(entry.question.endsWith("?")).toBe(true);
      expect(entry.answer.length).toBeGreaterThan(80);
    }
  });
});
