import { expect, test } from "@playwright/test";

/**
 * Gate evidence for the theme, in the same spirit as `screenshots.spec.ts`: files to be LOOKED AT.
 * Every palette in both modes, on a fund whose calendar fills both ramps end to end, with all
 * three disclosure sections open so the charts are in the picture too.
 *
 * Skipped unless SCREENS=1, so `pnpm e2e` and CI stay fast.
 *
 *   SCREENS=1 pnpm e2e --project=desktop e2e/theme-screens.spec.ts
 */

const OUT = "test-results/themes";
const PALETTES = ["marigold", "indigo", "sandstone", "graphite"] as const;
const MODES = ["light", "dark"] as const;
const KEY = "sip-date-planner.theme.v1";

test.beforeEach(({}, testInfo) => {
  test.skip(!process.env.SCREENS, "Set SCREENS=1 to capture gate evidence");
  test.skip(testInfo.project.name !== "desktop", "One project is enough for a look");
});

test.use({ viewport: { width: 1280, height: 1400 } });

for (const palette of PALETTES) {
  for (const mode of MODES) {
    test(`${palette} ${mode}`, async ({ page }) => {
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key!, value!),
        [KEY, JSON.stringify({ mode, palette })],
      );

      await page.goto("/f/119775");
      await expect(page.locator("#answer-heading")).toBeVisible();
      for (const name of [/The full curve/, /How confident is this/, /What actually matters/]) {
        await page.getByRole("button", { name }).click();
      }
      await expect(page.locator("[data-spread-chart] canvas")).toHaveCount(1);
      await expect(page.locator("[data-chart='matters'] svg.apexcharts-svg")).toHaveCount(1);

      await page.screenshot({ path: `${OUT}/${palette}-${mode}.png`, fullPage: true });
    });
  }
}
