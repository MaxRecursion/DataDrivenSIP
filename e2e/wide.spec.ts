import { expect, test } from "@playwright/test";

/**
 * Large desktop screens: the fund page is a four-column dashboard with every section open,
 * and the whole thing fits one screen — no vertical scroll (the user's requirement, 2026-09-22).
 *
 * The sizes are what a 4K monitor gives a browser window after its own toolbars: 1920×1080 at
 * 200% scaling leaves about 1920×960 CSS pixels, and 2560×1440 at 150% leaves about 2560×1320.
 * The check is measured, not eyeballed: scrollHeight against innerHeight, with every chart
 * drawn, because a chart landing late is exactly what would push a column past the fold.
 */

const SCREENS = [
  { name: "4K at 200%", width: 1920, height: 960 },
  { name: "4K at 150%", width: 2560, height: 1320 },
  { name: "4K at 100%", width: 3840, height: 2080 },
];

/**
 * Funds whose copy runs long in different places, so one short page can't pass alone. The last
 * four are the longest on the page in the dashboard's two tallest columns across all 999
 * published funds as of 2026-09-18 (answer and caveats; confidence and matters). A nightly
 * refresh can reorder that ranking, but copy length moves with the branches taken, not with
 * NAV figures, so these stay near the top.
 */
const FUNDS = [119775, 151713, 145137, 148507, 148750, 151040, 151113];

for (const screen of SCREENS) {
  test.describe(`${screen.name} (${screen.width}×${screen.height})`, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Large desktop screens only");
    });

    for (const code of FUNDS) {
      test(`/f/${code} fits one screen with every section open`, async ({ page }) => {
        await page.goto(`/f/${code}`);
        await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);

        // Held open, with no toggle to close them.
        for (const id of ["curve", "confidence", "matters"]) {
          await expect(page.locator(`[data-disclosure='${id}']`)).toHaveAttribute("data-state", "open");
        }
        await expect(page.locator("[data-spread-chart] canvas")).toHaveCount(1);
        await expect(page.locator("[data-chart='matters'] svg.apexcharts-svg")).toHaveCount(1);
        await expect(page.locator("[data-date]:not([data-unavailable])")).toHaveCount(28);

        const size = await page.evaluate(() => ({
          scroll: document.documentElement.scrollHeight,
          inner: window.innerHeight,
          scrollX: document.documentElement.scrollWidth,
          innerX: window.innerWidth,
        }));
        console.log(`${screen.name} /f/${code}: page ${size.scroll}px tall in a ${size.inner}px window`);
        expect(size.scroll, "the page needs a vertical scroll").toBeLessThanOrEqual(size.inner);
        expect(size.scrollX, "the page needs a horizontal scroll").toBeLessThanOrEqual(size.innerX);
      });
    }
  });
}

test.describe("below the wide breakpoint", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("sections stay closed disclosures, as before", async ({ page }) => {
    await page.goto("/f/119775");
    await expect(page.locator("#answer-heading")).toBeVisible();
    await expect(page.locator("[data-disclosure='curve']")).toHaveAttribute("data-state", "closed");
  });
});
