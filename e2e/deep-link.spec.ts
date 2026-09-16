import { expect, test } from "@playwright/test";

// Phase 4's gate: a deep link has to work on a cold load, with and without parameters, and
// without a hydration mismatch. These run against `wrangler dev`, which routes exactly as
// production does (PLAN.md D20).

const FUND = {
  code: 119775,
  name: "Kotak Mid Cap Fund - Direct Plan - Growth",
  house: "Kotak Mahindra Mutual Fund",
};

/** React reports a hydration mismatch through console.error, so nothing may be logged. */
function watchForErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("the HTML a crawler sees", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "HTTP-only checks run once");
  });

  test("a fund deep link carries the fund in the markup, not just in meta tags", async ({ request }) => {
    const response = await request.get(`/f/${FUND.code}`);
    expect(response.status()).toBe(200);
    const html = await response.text();

    // Inside #root: the page paints before any JavaScript runs.
    expect(html).toContain(FUND.name);
    expect(html).toContain(FUND.house);
    expect(html).toContain(`data-prerendered="/f/${FUND.code}"`);

    expect(html).toContain(`<title>${FUND.name} — SIP Date Planner</title>`);
    expect(html).toContain(`<meta property="og:title" content="${FUND.name} — SIP Date Planner" />`);
    expect(html).toContain(`content="https://sip-date-planner.kulkarniakshay1989.workers.dev/f/${FUND.code}"`);
    expect(html).toContain(`<script type="application/json" id="fund-data">`);

    // Data is fetched from a path carrying this version, so it must be stamped in.
    expect(html).toMatch(/<meta name="data-version" content="\d{4}-\d{2}-\d{2}\.[0-9a-f]{8}" \/>/);
    expect(html).toMatch(/<meta name="nav-as-of" content="\d{4}-\d{2}-\d{2}" \/>/);

    // The template's own description must not survive alongside the fund's.
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
  });

  test("the home page is prerendered for its own path", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain('data-prerendered="/"');
    expect(html).toContain("Which date should I run my SIP on?");
    expect(html).not.toContain('id="fund-data"');
  });
});

/**
 * Hydration leaves no trace of its own: a page that threw the server's markup away and
 * rendered from scratch ends up looking identical, and would pass an errors-only check just
 * as happily. So tag the server's markup while the HTML is still being parsed — React keeps
 * that node when it hydrates and discards it when it doesn't. A property rather than an
 * attribute, so React has nothing to diff against.
 */
async function tagServerMarkup(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const shell = document.querySelector("#root > div");
      if (!shell) return;
      (shell as unknown as { __fromServer?: boolean }).__fromServer = true;
      observer.disconnect();
    });
    // Not documentElement: this runs before the parser has made one. The document always exists.
    observer.observe(document, { childList: true, subtree: true });
  });
}

function keptServerMarkup(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const shell = document.querySelector("#root > div");
    return Boolean(shell && (shell as unknown as { __fromServer?: boolean }).__fromServer);
  });
}

test("a cold deep link hydrates the prerendered markup, without errors", async ({ page }) => {
  const errors = watchForErrors(page);
  await tagServerMarkup(page);

  await page.goto(`/f/${FUND.code}`);

  await expect(page.getByRole("heading", { level: 1, name: FUND.name })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("NAVs up to");
  await expect(page.getByRole("contentinfo")).toContainText("Not investment advice");

  // The point of the phase: the server's nodes were adopted, not replaced.
  expect(await keptServerMarkup(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("a deep link with parameters renders fresh instead of hydrating", async ({ page }) => {
  const errors = watchForErrors(page);
  await tagServerMarkup(page);

  // Parameters change what the app renders, so the prerendered markup no longer matches it.
  await page.goto(`/f/${FUND.code}?salary=28&buffer=2`);

  await expect(page.getByRole("heading", { level: 1, name: FUND.name })).toBeVisible();
  expect(await keptServerMarkup(page)).toBe(false);
  expect(errors).toEqual([]);
});

test("an uncovered fund code says so rather than failing", async ({ page }) => {
  const errors = watchForErrors(page);

  // No file exists for this path, so Workers serves the home page's HTML: the app must not
  // hydrate onto it, and the missing data file comes back as HTML with a 200.
  await page.goto("/f/999999");

  await expect(page.getByRole("heading", { level: 1, name: "This fund isn’t covered" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a malformed fund code is not read as a fund", async ({ page }) => {
  await page.goto(`/f/${FUND.code}x`);
  await expect(page.getByRole("heading", { level: 1, name: "This fund isn’t covered" })).toBeVisible();
});

test("schemes that look identical are told apart by their code", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox").fill("sundaram small cap");

  // Same name, same house, same category, different schemes: without the code the reader
  // would be choosing between two rows they cannot tell apart.
  const options = page.getByRole("option").filter({ hasText: "Sundaram Small Cap Fund" });
  await expect(options).toHaveCount(2);
  await expect(options.filter({ hasText: "code 119588" })).toHaveCount(1);
  await expect(options.filter({ hasText: "code 119589" })).toHaveCount(1);
});

test("searching a fund goes to its page", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto("/");
  await page.getByRole("combobox").fill("kotak mid");

  const first = page.getByRole("option").first();
  await expect(first).toContainText("Kotak Mid Cap");

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/f/${FUND.code}$`));
  await expect(page.getByRole("heading", { level: 1, name: FUND.name })).toBeVisible();
  expect(errors).toEqual([]);
});
