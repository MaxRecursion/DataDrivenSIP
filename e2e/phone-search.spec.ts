import { expect, test } from "@playwright/test";

/**
 * The search box on a phone.
 *
 * Its results list opens in the flow, under the field, so it is exactly as wide as the field is.
 * The Organic redesign put the mark and the field on one row, which on a phone left the field a
 * column about 200px wide: a fund house wrapped to one word a line and the verdict ran off the
 * right edge. This holds the two things that broke — the field's width, and nothing leaving the
 * viewport once results are open.
 */

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "A phone layout");
});

for (const path of ["/", "/f/119775"]) {
  test(`${path}: the field spans the screen and its results stay on it`, async ({ page }) => {
    await page.goto(path);
    const field = page.getByRole("combobox", { name: "Search for a fund" });
    await field.fill("hdfc");
    await expect(page.getByRole("option").first()).toBeVisible();

    const m = await page.evaluate(() => {
      const input = document.querySelector("#fund-search")!.getBoundingClientRect();
      const rows = [...document.querySelectorAll("[cmdk-item]")].map((row) => row.getBoundingClientRect().right);
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        inputWidth: input.width,
        widestRow: Math.max(...rows),
      };
    });

    // Most of the screen, not the 200px that sharing a row with the mark left it.
    expect(m.inputWidth).toBeGreaterThan(m.viewport * 0.8);
    expect(m.scrollWidth, "the page scrolls sideways").toBeLessThanOrEqual(m.viewport);
    expect(m.widestRow, "a result runs off the screen").toBeLessThanOrEqual(m.viewport);
  });
}
