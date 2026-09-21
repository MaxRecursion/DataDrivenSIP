import { expect, test } from "@playwright/test";

/**
 * Proves `pnpm build:ci` — the frozen fund set PLAN.md §10 asks for, so a CI build doesn't
 * depend on what last night's pipeline run happened to publish. Only meaningful against that
 * build, so it's skipped unless CI_FIXTURES=1:
 *
 *   pnpm build:ci
 *   CI_FIXTURES=1 pnpm exec wrangler dev --port 4173 --ip 127.0.0.1 &
 *   CI_FIXTURES=1 pnpm e2e e2e/ci-fixtures.spec.ts
 *
 * Not part of the main e2e run: the rest of the suite exercises real published funds by code
 * (103490, 142110, 145137, 151785 and others across disclosures.spec.ts and
 * screenshots.spec.ts), none of which exist in this four-fund set. Folding the whole suite into
 * `build:ci` would mean rewriting every one of those specs to a handful of codes — a large,
 * separate change PLAN.md doesn't ask this one to make, and this file says so rather than
 * quietly leaving it undone.
 */

test.beforeEach(({}, testInfo) => {
  test.skip(!process.env.CI_FIXTURES, "Only meaningful against `pnpm build:ci` — see the file header");
  test.skip(testInfo.project.name !== "desktop", "One device is enough for this");
});

const FROZEN = [119775, 151713];
const SYNTHETIC = [900001, 900002];

test("serves exactly the frozen and synthetic funds, and nothing else", async ({ page }) => {
  const response = await page.goto("/data/index.json");
  const index = (await response?.json()) as Array<[number]>;
  const codes = index.map((row) => row[0]).sort((a, b) => a - b);
  expect(codes).toEqual([...FROZEN, ...SYNTHETIC].sort((a, b) => a - b));
});

for (const code of [...FROZEN, ...SYNTHETIC]) {
  test(`/f/${code} renders a fully settled answer`, async ({ page }) => {
    await page.goto(`/f/${code}`);
    await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
  });
}

test("a code outside the frozen set falls back to the shell rather than a stale answer", async ({
  page,
}) => {
  const response = await page.goto("/f/999999");
  expect(response?.status()).toBe(200);
  await expect(page.getByText(/isn.t covered/i)).toBeVisible();
});

test("the synthetic meaningful fund exercises that branch of the headline", async ({ page }) => {
  await page.goto("/f/900001");
  await expect(page.locator("#answer-heading")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("above the middle of the month");
});

test("the synthetic marginal fund exercises that branch of the headline", async ({ page }) => {
  await page.goto("/f/900002");
  await expect(page.locator("#answer-heading")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("but by very little");
});
