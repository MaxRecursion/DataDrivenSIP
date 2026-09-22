import { expect, test } from "@playwright/test";

/**
 * The trending list the search box shows when it's clicked while empty: the funds whose NAV
 * rose most over the past month (pipeline/analysis/momentum.ts). trending.json is written by
 * the nightly pipeline, so these tests serve their own copy — real fund codes, fixed figures —
 * rather than depend on what last night's run published.
 */

const TRENDING = {
  navAsOf: "2026-09-18",
  basis: "NAV change over the past month",
  funds: [
    { code: 119775, name: "Kotak Mid Cap Fund - Direct Plan - Growth", house: "Kotak Mahindra Mutual Fund", monthPct: 4.25 },
    { code: 142110, name: "Mahindra Manulife Mid Cap Fund - Direct Plan - Growth", house: "Mahindra Manulife Mutual Fund", monthPct: 2.1 },
    { code: 151713, name: "quant Dynamic Asset Allocation Fund - Direct Plan - Growth Option", house: "quant Mutual Fund", monthPct: -0.84 },
  ],
};

const HEADING = "Trending: biggest NAV gains over the past month";

async function serveTrending(page: import("@playwright/test").Page, body: unknown = TRENDING) {
  await page.route("**/data/trending.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

/** The visible heading. cmdk also carries the same words as the listbox's hidden label. */
const heading = (page: import("@playwright/test").Page) => page.locator("[data-list-heading]");

const field = (page: import("@playwright/test").Page) =>
  page.getByRole("combobox", { name: "Search for a fund" });

test("an autofocused field opens nothing, and fetches nothing, until it's clicked", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await serveTrending(page);

  await page.goto("/");
  await expect(field(page)).toBeFocused();
  await expect(heading(page)).toHaveCount(0);
  expect(requested.some((url) => url.includes("trending.json"))).toBe(false);

  await field(page).click();
  await expect(heading(page)).toBeVisible();
});

test("clicking the empty field lists trending funds, ranked, with each one's month", async ({ page }) => {
  await serveTrending(page);
  await page.goto("/");
  await field(page).click();
  await expect(heading(page)).toHaveText(HEADING);

  const options = page.getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Kotak Mid Cap Fund");
  await expect(options.nth(0)).toContainText("+4.3% in a month");
  // A fall is shown as a fall, with a real minus.
  await expect(options.nth(2)).toContainText("−0.8% in a month");
});

test("choosing a trending fund opens its page", async ({ page }) => {
  await serveTrending(page);
  await page.goto("/");
  await field(page).click();
  await expect(heading(page)).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/f\/142110$/);
  await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
});

test("typing replaces the trending list with ordinary search matches", async ({ page }) => {
  await serveTrending(page);
  await page.goto("/");
  await field(page).click();
  await expect(heading(page)).toBeVisible();

  await field(page).fill("quant dynamic");
  await expect(heading(page)).toHaveCount(0);
  await expect(page.getByRole("option").first()).toContainText("quant Dynamic Asset Allocation");
  await expect(page.locator("[data-trend-change]")).toHaveCount(0);
});

test("a missing trending file leaves the field quiet rather than broken", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // What Workers actually does for a missing file: the app shell, as HTML, with a 200.
  await page.route("**/data/trending.json", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
  );

  await page.goto("/");
  await field(page).click();
  await page.waitForTimeout(300);
  await expect(page.getByRole("option")).toHaveCount(0);
  expect(errors).toEqual([]);
});
