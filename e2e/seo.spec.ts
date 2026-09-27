import { expect, test } from "@playwright/test";

/**
 * What a crawler actually gets, served the way production serves it.
 *
 * The unit tests cover what the strings say; these cover the things only the real server can
 * answer. Is `/funds` reachable at all, or does Workers hand back the SPA shell for it? Are the
 * thousand links in the HTML, or only after JavaScript runs? Does `robots.txt` exist at the root
 * where a crawler looks for it, and does the sitemap it names parse?
 *
 * HTTP-only where possible, so they run once rather than per device.
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Crawler-facing checks run once");
});

test("robots.txt is served at the root and names an absolute sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");

  const body = await response.text();
  expect(body).toContain("User-agent: *");
  const sitemap = /^Sitemap: (\S+)$/m.exec(body)?.[1];
  expect(sitemap, "robots.txt must name a sitemap").toBeDefined();
  expect(sitemap?.startsWith("http")).toBe(true);
});

test("the sitemap parses, and lists the home page, the directory and every fund", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");

  const xml = await response.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");

  // An unescaped ampersand is the classic way a sitemap silently stops being read.
  expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  expect(locations.length).toBeGreaterThan(1000);
  expect(locations.some((url) => url.endsWith("/"))).toBe(true);
  expect(locations.some((url) => url.endsWith("/funds"))).toBe(true);
  expect(locations).toContain(locations.find((url) => url.endsWith("/f/119775")));
  expect(new Set(locations).size, "a sitemap must not repeat a URL").toBe(locations.length);
});

test("the data files are crawlable but told not to be indexed", async ({ request }) => {
  // Disallowing them in robots.txt would stop Google fetching them, and a URL it cannot fetch is
  // one it can still list without content. Fetchable plus noindex is what actually keeps them out.
  const response = await request.get("/data/index.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  // And the cache header the overlapping rule above it must not have eaten.
  expect(response.headers()["cache-control"]).toContain("max-age=3600");
});

test("the directory is a real page with real links, before any JavaScript runs", async ({ request }) => {
  const response = await request.get("/funds");
  expect(response.status()).toBe(200);

  const html = await response.text();
  // Prerendered, not the shell: the links have to be in the document a crawler reads.
  const links = [...html.matchAll(/href="\/f\/(\d+)"/g)].map((match) => match[1]);
  expect(links.length).toBeGreaterThan(1000);
  expect(new Set(links).size).toBe(links.length);

  expect(html).toContain("<title>All funds");

  // The markup lists what the page lists, in the page's order and under the page's names.
  const block = /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"CollectionPage".*?)<\/script>/.exec(html)?.[1];
  expect(block, "no CollectionPage markup").toBeDefined();
  const marked = (JSON.parse(block ?? "{}") as { mainEntity: { itemListElement: Array<{ name: string; url: string }> } })
    .mainEntity.itemListElement;
  const shown = [...html.matchAll(/<a[^>]*href="\/f\/(\d+)"[^>]*>([^<]*(?:<!-- -->[^<]*)*)<\/a>/g)].map((match) => ({
    code: match[1],
    text: (match[2] ?? "").replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&"),
  }));
  for (const [index, item] of marked.slice(0, 20).entries()) {
    expect(item.url.endsWith(`/f/${shown[index]?.code}`), `position ${index + 1}`).toBe(true);
    expect(shown[index]?.text, `position ${index + 1}`).toBe(item.name);
  }
  expect(html).toContain("Every mutual fund covered");
  expect(html).toContain('rel="canonical"');
  expect(html).toContain('"@type":"BreadcrumbList"');
});

test("every page carries a canonical of its own, and the home page declares the site", async ({ request }) => {
  const canonicals = new Set<string>();
  for (const path of ["/", "/funds", "/f/119775", "/f/151713"]) {
    const html = await (await request.get(path)).text();
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical, `no canonical on ${path}`).toBeDefined();
    expect(canonical?.endsWith(path === "/" ? "/" : path), `${path} points at ${canonical}`).toBe(true);
    canonicals.add(canonical ?? "");
    expect(html, `${path} must be indexable`).toContain('name="robots" content="index, follow');
  }
  expect(canonicals.size).toBe(4);

  const home = await (await request.get("/")).text();
  expect(home).toContain('"@type":"WebSite"');
  expect(home).toContain('"@type":"FAQPage"');
});

test("a fund page's title and description carry that fund's own answer", async ({ request }) => {
  const html = await (await request.get("/f/119775")).text();
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";

  expect(title).toContain("Kotak Mid Cap Fund");
  expect(title).toMatch(/SIP on the \d+(st|nd|rd|th)/);
  expect(description).toMatch(/strongest SIP date/);
  // The same answer the page itself prints, not a second opinion in the head.
  const named = /SIP on the (\d+)/.exec(title)?.[1];
  expect(description).toContain(`The ${named}`);
  expect(html).toContain('"@type":"WebPage"');
});

test("the directory and the fund pages link to each other, so neither is an orphan", async ({ page }) => {
  await page.goto("/");
  // Every page's footer reaches the directory; the directory reaches every fund.
  await page.getByRole("contentinfo").getByRole("link", { name: "All funds" }).click();
  await expect(page).toHaveURL(/\/funds$/);
  await expect(page.getByRole("heading", { level: 1, name: "Every mutual fund covered" })).toBeVisible();

  const fund = page.getByRole("link", { name: "Kotak Mid Cap Fund - Direct Plan - Growth" }).first();
  await expect(fund).toBeVisible();
  await fund.click();
  await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
});

test("the home page answers the questions it marks up, in visible text", async ({ page }) => {
  // Structured data describing content a reader can't see is against Google's guidelines, and is
  // how a site loses rich results rather than earning them.
  await page.goto("/");

  const marked = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const block of blocks) {
      const parsed = JSON.parse(block.textContent ?? "{}") as {
        "@type"?: string;
        mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }>;
      };
      if (parsed["@type"] === "FAQPage") return parsed.mainEntity ?? [];
    }
    return [];
  });

  expect(marked.length).toBeGreaterThanOrEqual(5);
  const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  for (const entry of marked) {
    expect(text, `question not on the page: ${entry.name}`).toContain(entry.name);
    expect(text.includes(entry.acceptedAnswer.text.replace(/\s+/g, " "))).toBe(true);
  }
});

test("hydration keeps the head the prerender wrote, which is what Google indexes", async ({ page, request }) => {
  // Google renders the page and indexes the head as it stands afterwards. Until 2026-09-27 the
  // fund page's effect replaced the prerendered title with a shared template sentence, so every
  // fund went back to one title the moment JavaScript ran. Fetching the raw HTML, as the checks
  // above do, cannot see that — this runs the page.
  // 119588 is one of the schemes AMFI publishes under a shared name; its title carries its code.
  for (const code of [119775, 119588]) {
    const served = await (await request.get(`/f/${code}`)).text();
    const title = /<title>([^<]*)<\/title>/.exec(served)?.[1]?.replace(/&amp;/g, "&") ?? "";
    const description = /<meta name="description" content="([^"]*)"/.exec(served)?.[1]?.replace(/&amp;/g, "&") ?? "";
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(served)?.[1] ?? "";

    await page.goto(`/f/${code}`);
    await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);

    await expect(page).toHaveTitle(title);
    const head = await page.evaluate(() => ({
      description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
      twitter: document.querySelector('meta[name="twitter:title"]')?.getAttribute("content"),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      canonicals: document.querySelectorAll('link[rel="canonical"]').length,
    }));
    expect(head.description, `${code} description`).toBe(description);
    expect(head.twitter, `${code} twitter:title`).toBe(title);
    expect(head.canonical, `${code} canonical`).toBe(canonical);
    expect(head.canonicals).toBe(1);
  }
  expect(await page.title()).toContain("(scheme 119588)");
});

test("moving between pages inside the app moves the canonical with it", async ({ page }) => {
  await page.goto("/f/119775");
  await expect(page.locator("#answer-heading")).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "All funds" }).click();
  await expect(page).toHaveURL(/\/funds$/);
  await expect(page).toHaveTitle(/^All funds/);
  const canonical = await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.getAttribute("href"));
  expect(canonical?.endsWith("/funds")).toBe(true);
});
