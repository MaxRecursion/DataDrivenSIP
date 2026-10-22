import { expect, test } from "@playwright/test";

/**
 * The calendar: one real month, rendered after mount.
 *
 * It used to step three months ahead, and most of this file guarded that traversal. The
 * Organic redraw dropped it (2026-10-22): every figure in the grid is a full-history XIRR,
 * identical in every month, so paging only re-dealt the same 28 numbers into different
 * weekday columns. What is left to guard is what the one month must always say — 28 usable
 * dates, one named day, today marked once — and that the clock is read in the browser rather
 * than baked in at build time.
 */

const KOTAK = "/f/119775";
const MONTH = /^[A-Z][a-z]+ \d{4}$/;

test.beforeEach(async ({ page }) => {
  await page.goto(KOTAK);
  await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
});

test("opens on a real month, resolved after mount", async ({ page }) => {
  // The label is blank in the prerendered HTML and filled after mount; a real month here is the
  // proof that the clock is read in the browser rather than baked in at build time.
  await expect(page.getByText(MONTH)).toBeVisible();

  // And no way to leave it: the arrows are gone, not merely disabled.
  await expect(page.getByRole("button", { name: "Previous month" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next month" })).toHaveCount(0);
});

test("says the same things about SIP dates every day of the year", async ({ page }) => {
  await expect(page.locator("[data-date]:not([data-unavailable])")).toHaveCount(28);
  await expect(page.locator("[data-date][data-answer]")).toHaveCount(1);
  // Today is in this month by construction, and carries the baseline mark exactly once. Past
  // the 28th the baseline clamps onto the 28th, which is still one cell.
  await expect(page.locator("[data-date][data-baseline]")).toHaveCount(1);
});

test("draws the days that are never SIP dates, rather than leaving a hole", async ({ page }) => {
  // A 28-day February draws none; every longer month draws the 29th onwards, inert.
  const inert = page.locator("[data-date][data-unavailable]");
  const count = await inert.count();
  expect(count, "a month has at most three days beyond the 28th").toBeLessThanOrEqual(3);
  for (const cell of await inert.all()) {
    expect(Number(await cell.getAttribute("data-date"))).toBeGreaterThan(28);
  }
});

test("comparing a date does not replay the entrance reveal", async ({ page }) => {
  /**
   * The regression this exists for: `Animated` re-runs whenever its delay changes, and
   * `useReveal` never clears itself back to null. Before the guard, any state change after the
   * reveal replayed all 28 cells — for the life of the page, not merely during the first
   * 700 ms. Month navigation used to be the way to trigger it; tapping a date to compare is
   * the one that remains.
   */
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search for a fund" }).fill("kotak mid");
  await expect(page.getByRole("option").first()).toContainText("Kotak Mid Cap");
  await page.keyboard.press("Enter");
  await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);

  // The reveal has to have actually run, or this would pass on a page that never animates.
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().length), { timeout: 3000 })
    .toBe(0);

  /*
   * Counts scripted animations only. Tapping a date legitimately crossfades the selected ring,
   * and that is a CSS transition; the reveal is `element.animate()`, which is a plain
   * Animation. Counting both would make this pass or fail on the crossfade instead of on the
   * thing it is guarding.
   */
  const target = page.locator("[data-date]:not([data-unavailable]):not([data-answer])").first();
  const day = await target.getAttribute("data-date");
  await target.click();
  const peak = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const scripted = () =>
          document.getAnimations().filter((a) => a.constructor.name === "Animation").length;
        let highest = 0;
        const started = performance.now();
        const sample = () => {
          highest = Math.max(highest, scripted());
          if (performance.now() - started > 1000) resolve(highest);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(peak, "comparing a date replayed the reveal").toBe(0);

  // And the tap really did land, so the assertion above is not passing on a dead cell.
  await expect(page.locator(`[data-date="${day}"][data-compare]`)).toHaveCount(1);
});
