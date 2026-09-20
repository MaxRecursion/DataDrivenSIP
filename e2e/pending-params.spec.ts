import { expect, test } from "@playwright/test";

/**
 * PLAN.md §6.2: every fund page is prerendered with DEFAULT parameters, so a page whose URL asks
 * for a different window has the WRONG date sitting in its HTML. It must never be visible.
 *
 * Asserting the settled state would prove nothing — the page ends up correct either way, with or
 * without the fix. So these record every value the answer heading holds *while it is visible*,
 * and fail if the prerendered default was ever on screen, even for one frame.
 */

const KOTAK = 119775;
/** What the prerendered HTML says, and what a reader on ?salary=15 must never see. */
const PRERENDERED_DATE = "The 12th";
/** What that reader's window actually answers with.  */
const SALARY_15_DATE = "The 25th";

declare global {
  interface Window {
    __visibleHeadings?: string[];
  }
}

async function recordVisibleHeadings(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    window.__visibleHeadings = seen;

    const sample = () => {
      const heading = document.getElementById("answer-heading");
      if (!heading || getComputedStyle(heading).visibility === "hidden") return;
      const text = (heading.textContent ?? "").trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    };

    // Per frame rather than per mutation: a paint can land between DOM changes, and it is the
    // painted frames this is about.
    const tick = () => {
      sample();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const visibleHeadings = (page: import("@playwright/test").Page): Promise<string[]> =>
  page.evaluate(() => window.__visibleHeadings ?? []);

test("a deep link carrying a salary never paints the date it was prerendered with", async ({ page }) => {
  await recordVisibleHeadings(page);

  await page.goto(`/f/${KOTAK}?salary=15`);
  // By id, not by text: the date also appears inside the headline sentence and the
  // screen-reader summary, and this test is about one specific element being painted.
  await expect(page.locator("#answer-heading")).toHaveText(SALARY_15_DATE);

  const seen = await visibleHeadings(page);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen).not.toContain(PRERENDERED_DATE);
  expect(seen.at(-1)).toBe(SALARY_15_DATE);
});

test("a plain deep link is never hidden, because its prerendered answer is already right", async ({ page }) => {
  await recordVisibleHeadings(page);

  // Nothing to correct here, so hiding the answer would only delay a correct page.
  await page.goto(`/f/${KOTAK}`);
  await expect(page.locator("#answer-heading")).toHaveText(PRERENDERED_DATE);

  expect(await page.evaluate(() => document.documentElement.dataset.paramsPending)).toBeUndefined();
  expect(await visibleHeadings(page)).toEqual([PRERENDERED_DATE]);
});

test("the mark is cleared even on a page that never renders an answer", async ({ page }) => {
  // The dangerous failure is the opposite one: a page left hidden for good. A fund with no data
  // renders no heading at all, so clearing must not depend on an answer ever arriving.
  await page.goto("/f/999999?salary=15");
  await expect(page.getByRole("heading", { level: 1, name: "This fund isn’t covered" })).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.paramsPending))
    .toBeUndefined();
});

test("the fund's own facts stay on screen while the window-dependent parts are hidden", async ({ page }) => {
  // Hiding more than necessary would read as a broken page. The name, the rupee line and the
  // compliance footer are facts about the fund, not about the window, so they never move.
  await page.goto(`/f/${KOTAK}?salary=15`);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("Not investment advice");
  await expect(page.getByText(/notional ₹10,000/)).toBeVisible();
});
