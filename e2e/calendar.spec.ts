import { expect, test } from "@playwright/test";

/**
 * The calendar's month traversal (CLAUDE.md: a real month, rendered after mount, reachable for
 * three months ahead).
 *
 * What this guards is the bound and the invariants that have to hold in every month the reader
 * can reach: 28 usable dates, one answer, ten outlined. A month with 31 days draws three inert
 * cells and a February draws none, and neither may change any of those counts.
 */

const KOTAK = "/f/119775";
const MONTH = /^[A-Z][a-z]+ \d{4}$/;

test.beforeEach(async ({ page }) => {
  await page.goto(KOTAK);
  await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
});

test("opens on a real month and will not go back past it", async ({ page }) => {
  // The label is blank in the prerendered HTML and filled after mount; a real month here is the
  // proof that the clock is read in the browser rather than baked in at build time.
  await expect(page.getByText(MONTH)).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeDisabled();
});

test("reaches three months ahead and stops", async ({ page }) => {
  const next = page.getByRole("button", { name: "Next month" });
  const back = page.getByRole("button", { name: "Previous month" });
  const seen: string[] = [];

  for (let step = 0; step < 4; step++) {
    const label = await page.getByText(MONTH).textContent();
    seen.push(label ?? "");

    // Every month the reader can reach says the same things about SIP dates.
    await expect(page.locator("[data-date]:not([data-unavailable])")).toHaveCount(28);
    await expect(page.locator("[data-date][data-in-window]")).toHaveCount(10);
    await expect(page.locator("[data-date][data-answer]")).toHaveCount(1);

    if (step < 3) await next.click();
  }

  expect(new Set(seen).size, `four distinct months, got ${seen.join(", ")}`).toBe(4);
  await expect(next).toBeDisabled();
  await expect(back).toBeEnabled();
});

test("draws the days that are never SIP dates, rather than leaving a hole", async ({ page }) => {
  const next = page.getByRole("button", { name: "Next month" });

  // Across four consecutive months at least one has 31 days, so the inert cells must appear
  // somewhere in this walk — and they are the 29th onwards wherever they do.
  let inertSeen = 0;
  for (let step = 0; step < 4; step++) {
    const inert = page.locator("[data-date][data-unavailable]");
    for (const cell of await inert.all()) {
      expect(Number(await cell.getAttribute("data-date"))).toBeGreaterThan(28);
    }
    inertSeen += await inert.count();
    if (step < 3) await next.click();
  }
  expect(inertSeen).toBeGreaterThan(0);
});
