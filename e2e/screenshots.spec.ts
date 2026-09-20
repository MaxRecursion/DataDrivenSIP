import { expect, test } from "@playwright/test";

/**
 * The Phase 5 gate evidence: every verdict state at every width, plus a magnified look at the
 * rupee glyph (PLAN.md §14). These write files and assert almost nothing — they exist to be
 * LOOKED AT and critiqued, which is the actual gate. They are skipped unless SCREENS=1, so
 * `pnpm e2e` and CI stay fast:
 *
 *   SCREENS=1 pnpm e2e --project=desktop e2e/screenshots.spec.ts
 */

const OUT = "test-results/screens";

/** One real published fund per verdict × confidence combination — no synthetic fixtures needed. */
const FUNDS = [
  { code: 119775, label: "noise-full", note: "Kotak Mid Cap, 164 instalments" },
  { code: 151713, label: "marginal-reduced", note: "quant Dynamic Asset Allocation, 40 months" },
  { code: 103490, label: "marginal-full", note: "Quantum Value, 245 instalments" },
  { code: 142110, label: "meaningful-full", note: "Mahindra Manulife Mid Cap, 103 instalments" },
  { code: 145137, label: "meaningful-short", note: "Invesco India Small Cap, 94 — D21 caveat" },
  // 5 of 994 funds lost money, and all 5 lost it on every date. Nothing else in this list
  // paints the grid's red ramp, so without this the loss colour ships unlooked at.
  { code: 151785, label: "loss-red", note: "Axis Nifty IT Index, −9.52% to −8.59%" },
];

const WIDTHS = [360, 390, 768, 1280];

/** The answer heading is the ordinal alone, so this is how we know the page has settled. */
const ANSWER_HEADING = /^The \d+(st|nd|rd|th)$/;

test.beforeEach(({}, testInfo) => {
  test.skip(!process.env.SCREENS, "Set SCREENS=1 to capture gate evidence");
  test.skip(testInfo.project.name !== "desktop", "Widths are set explicitly; run once");
});

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const fund of FUNDS) {
      test(`${fund.label} (${fund.code})`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(error.message));

        await page.goto(`/f/${fund.code}`);
        await expect(page.getByText(ANSWER_HEADING)).toBeVisible();

        await page.screenshot({ path: `${OUT}/${width}-${fund.label}-${fund.code}.png`, fullPage: true });

        // Worth knowing while looking at the picture: a console error would explain a wrong render.
        expect(errors, `console errors on /f/${fund.code}`).toEqual([]);
      });
    }
  });
}

test.describe("the rupee glyph, magnified", () => {
  // Satoshi has no ₹; it is borrowed from the Cabinet file by unicode-range (src/styles/index.css).
  // At 3× a mismatched glyph, a wrong weight or a shifted baseline is obvious.
  test.use({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });

  test("renders in the rupee line", async ({ page }) => {
    await page.goto("/f/119775");
    const rupeeLine = page.getByText(/notional ₹10,000/);
    await expect(rupeeLine).toBeVisible();
    await rupeeLine.screenshot({ path: `${OUT}/rupee-glyph-3x.png` });
  });
});

/** The Phase 7 gate asks for the sections both ways: collapsed is in every fund shot above. */
for (const width of [390, 1280]) {
  test.describe(`the disclosures at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("all three open", async ({ page }) => {
      await page.goto("/f/119775");
      for (const name of ["The full curve", "How confident is this?", "What actually matters"]) {
        await page.getByRole("button", { name, exact: true }).click();
      }
      // The chart is a lazy chunk inside a lazy chunk; without this the shot can catch its gap.
      await expect(page.locator("[data-spread-chart]")).toBeVisible();
      await expect(page.locator("canvas")).toHaveCount(1);

      await page.screenshot({ path: `${OUT}/${width}-disclosures-open.png`, fullPage: true });
    });
  });
}

test.describe("the landing page", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("shows no grid before a fund is chosen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/390-landing.png`, fullPage: true });
  });
});
