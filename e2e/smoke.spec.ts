import { expect, test } from "@playwright/test";

test("home renders the question and the compliance footer without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Which date should I run my SIP on?" }),
  ).toBeVisible();
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText(
    "Educational tool. Not investment advice. Past performance does not indicate future results.",
  );
  await expect(footer).toContainText("Not registered with SEBI.");
  await expect(
    footer.getByRole("link", { name: /Product Hunt/ }),
  ).toHaveAttribute("href", /producthunt\.com\/products\/sip-date-planner/);
  expect(errors).toEqual([]);
});

test("self-hosted fonts load", async ({ page }) => {
  await page.goto("/");
  // Both are font-display: optional, so a slow connection would quietly keep the metric-matched
  // fallback. These assert the real files resolve on a normal load — the reason that choice is
  // safe (CLAUDE.md). The rupee is checked too: ₹ lives in each family's latin-ext slice, and
  // loading only the Latin one is exactly how it would silently fall back to a system face.
  const loaded = await page.evaluate(async () => {
    const [caprasimo, figtree, rupee] = await Promise.all([
      document.fonts.load('400 32px "Caprasimo"'),
      document.fonts.load('400 16px "Figtree"'),
      document.fonts.load('400 16px "Figtree"', "\u20b9"),
    ]);
    return { caprasimo: caprasimo.length, figtree: figtree.length, rupee: rupee.length };
  });
  expect(loaded.caprasimo).toBeGreaterThan(0);
  expect(loaded.figtree).toBeGreaterThan(0);
  expect(loaded.rupee).toBeGreaterThan(0);
});

test("an app route falls back to the SPA shell", async ({ page }) => {
  await page.goto("/f/119775?salary=28&buffer=2");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
