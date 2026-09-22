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
  const loaded = await page.evaluate(async () => {
    const [cabinet, satoshi] = await Promise.all([
      document.fonts.load('700 32px "Cabinet Grotesk"'),
      document.fonts.load('400 16px "Satoshi"'),
    ]);
    return { cabinet: cabinet.length, satoshi: satoshi.length };
  });
  expect(loaded.cabinet).toBeGreaterThan(0);
  expect(loaded.satoshi).toBeGreaterThan(0);
});

test("an app route falls back to the SPA shell", async ({ page }) => {
  await page.goto("/f/119775?salary=28&buffer=2");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
