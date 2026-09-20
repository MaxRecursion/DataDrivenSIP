import { expect, test } from "@playwright/test";

/**
 * The reveal (PLAN.md §8), and acceptance criterion 8: reduced motion bypasses it entirely.
 *
 * "Nothing animated" is only worth asserting next to proof that something animates otherwise.
 * Every check here comes in a pair — reduced motion against motion allowed — because a reveal
 * that silently never ran would satisfy the criterion while failing the product.
 */

const KOTAK = { code: 119775, query: "kotak mid" };

declare global {
  interface Window {
    __peakAnimations?: number;
  }
}

/**
 * Records the most animations alive in any single frame. Sampling once after the fact would
 * almost always land after the 700 ms sequence had finished and report zero either way.
 */
async function watchAnimations(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    window.__peakAnimations = 0;
    const sample = () => {
      const running = document.getAnimations().length;
      if (running > (window.__peakAnimations ?? 0)) window.__peakAnimations = running;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

const peak = (page: import("@playwright/test").Page) => page.evaluate(() => window.__peakAnimations ?? 0);

/** The only path that reveals: a fund chosen inside the app, which the router reports as PUSH. */
async function chooseFundFromSearch(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search for a fund" }).fill(KOTAK.query);
  await expect(page.getByRole("option").first()).toContainText("Kotak Mid Cap");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/f/${KOTAK.code}`));
}

/** The sequence is capped at 700 ms (§8.2); a second is comfortably past its end. */
const afterTheSequence = (page: import("@playwright/test").Page) => page.waitForTimeout(1000);

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("criterion 8: choosing a fund lands the final state with nothing animating", async ({ page }) => {
    await watchAnimations(page);
    await chooseFundFromSearch(page);

    // The answer is there to be read, not on its way in.
    await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
    await expect(page.locator("[data-date][data-answer]")).toHaveCount(1);
    await expect(page.locator("[data-date][data-in-window]")).toHaveCount(10);

    await afterTheSequence(page);
    // §8.4 asks for exactly this: document.getAnimations() empty throughout.
    expect(await peak(page)).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("the rupee figure is its final value, never counted up to", async ({ page }) => {
    await chooseFundFromSearch(page);

    // No rAF ticker at all under reduced motion (§8.3), so the figure never passes through a
    // number that isn't the answer.
    const ticker = page.locator("[data-rupee-ticker]");
    await expect(ticker).toHaveText(/^₹[\d,]+$/);
    const atOnce = await ticker.textContent();
    await afterTheSequence(page);
    expect(await ticker.textContent()).toBe(atOnce);
  });
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("choosing a fund does animate, which is what makes the criterion mean something", async ({ page }) => {
    await watchAnimations(page);
    await chooseFundFromSearch(page);
    await afterTheSequence(page);

    // The complement of the criterion-8 test above. Without this, a reveal that never ran would
    // pass that test and fail every reader.
    expect(await peak(page)).toBeGreaterThan(0);
  });

  test("the sequence is over well inside its 700 ms cap", async ({ page }) => {
    await chooseFundFromSearch(page);
    await afterTheSequence(page);

    // Nothing may still be running a second later; §8.2 budgets the whole reveal at 700 ms.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("a cold deep link never animates, because there is nothing to morph from", async ({ page }) => {
    // D10c: an entrance animation on a cold load would delay LCP and has no gesture behind it.
    await watchAnimations(page);
    await page.goto(`/f/${KOTAK.code}`);
    await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
    await afterTheSequence(page);

    expect(await peak(page)).toBe(0);
  });

  test("the answer is readable immediately, whatever is still moving around it", async ({ page }) => {
    // Criterion 1 is about the date being committed and visible; the reveal must not delay it.
    await chooseFundFromSearch(page);
    await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
    expect(
      await page.locator("#answer-heading").evaluate((node) => getComputedStyle(node).opacity),
    ).toBe("1");
  });
});
