import { expect, test } from "@playwright/test";

/**
 * The three disclosure sections (PLAN.md §6.5). These are what a reader opens when they don't
 * believe the headline, so the tests are about the sections agreeing with it — and about the
 * chart genuinely not existing until it is asked for, which is the whole reason it can afford
 * to be a charting library at all.
 */

const KOTAK = { code: 119775, cohort: true };
/** 245 instalments puts it in a band with too few funds to have a typical spread. */
const NO_COHORT = { code: 103490 };

const TRIGGERS = {
  curve: "The full curve",
  confidence: "How confident is this?",
  matters: "What actually matters",
} as const;

/** React reports a hydration mismatch through console.error, so nothing may be logged. */
function watchForErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const trigger = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** The sections arrive in a lazy chunk, so they are not in the cold HTML. */
async function ready(page: import("@playwright/test").Page): Promise<void> {
  await expect(trigger(page, TRIGGERS.curve)).toBeVisible();
}

test("all three sections start closed, with the chart not merely hidden but absent", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);

  for (const name of Object.values(TRIGGERS)) {
    await expect(trigger(page, name)).toHaveAttribute("aria-expanded", "false");
  }

  // Radix renders nothing for a closed section, which is what keeps uPlot out of a page that
  // nobody opens. "Hidden" would not be the same claim.
  await expect(page.locator("[data-spread-chart]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("opening the curve draws a chart that names the same date as the answer", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.curve).click();

  await expect(page.locator("[data-spread-chart]")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);

  // The picture and the sentence are two renderings of one pick; a reader who trusts the chart
  // and a reader who trusts the words have to act the same way.
  const heading = (await page.locator("#answer-heading").textContent()) ?? "";
  const answerBar = page.locator("[data-bar-date][data-answer]");
  await expect(answerBar).toHaveCount(1);
  expect(heading).toContain(String(await answerBar.getAttribute("data-bar-date")));

  // One bar per SIP date, and the chart compares those and nothing else.
  await expect(page.locator("[data-bar-date]")).toHaveCount(28);
  expect(errors).toEqual([]);
});

test("the caption states the span the zoomed axis is hiding", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.curve).click();

  // Without this number a zoomed axis turns a tenth of a point into a mountain range.
  await expect(page.getByText(/Top to bottom of this chart is [\d.]+ pp of XIRR/)).toBeVisible();
});

test("the confidence section puts this fund's spread beside a typical one", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.confidence).click();

  const body = page.locator("[data-disclosure='confidence']");
  await expect(body).toContainText("Its 28 dates differ by");
  // D21's whole ask: show the comparison rather than assert it.
  await expect(body).toContainText(/for a fund with a similar length of history/);
  expect(errors).toEqual([]);
});

test("a fund with no comparable peers claims no comparison", async ({ page }) => {
  await page.goto(`/f/${NO_COHORT.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.confidence).click();

  const body = page.locator("[data-disclosure='confidence']");
  await expect(body).toContainText("too few published funds");
  await expect(body).not.toContainText("for a fund with a similar length of history");
});

test("the missed instalment never appears as an average without its range", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.matters).click();

  const body = page.locator("[data-disclosure='matters']");
  // D7 is explicit that an average alone reads as a guarantee.
  await expect(body).toContainText("on average");
  await expect(body).toContainText(/anywhere from ₹[\d,]+ to ₹[\d,]+/);
  await expect(body).toContainText("not a promise");
  // The one thing the arithmetic cannot know gets the last word.
  await expect(body).toContainText("funded on whichever date you pick");
});

test("a keyboard alone opens a section", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);

  await trigger(page, TRIGGERS.matters).focus();
  await page.keyboard.press("Enter");

  await expect(trigger(page, TRIGGERS.matters)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-disclosure='matters']")).toContainText(
    "funded on whichever date you pick",
  );
});

test("opening a section leaves the answer above it alone", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);

  const before = await page.locator("#answer-heading").textContent();
  const shadedBefore = await page.locator("[data-date][data-direction]").count();

  await trigger(page, TRIGGERS.curve).click();
  await expect(page.locator("[data-spread-chart]")).toBeVisible();

  expect(await page.locator("#answer-heading").textContent()).toBe(before);
  expect(await page.locator("[data-date][data-direction]").count()).toBe(shadedBefore);
});

/**
 * The ApexCharts visuals. Apex is the heaviest thing the app can load — more than everything
 * else put together — so the first claim is that a page nobody opens a section on never
 * requests it. The rest check the charts agree with the answer, structurally rather than by
 * pinning a number a nightly refresh would move.
 */
const isApex = (url: string) => /\/assets\/(core|bar|radialBar)\.esm-/.test(url);

test("ApexCharts is not requested until a section that uses it is opened", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));

  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.curve).click();
  await expect(page.locator("[data-spread-chart]")).toBeVisible();
  expect(requested.filter(isApex), "Apex loaded for a section that doesn't use it").toEqual([]);

  await trigger(page, TRIGGERS.confidence).click();
  await expect(page.locator("[data-chart='confidence'] svg").first()).toBeVisible();
  expect(requested.some(isApex)).toBe(true);
});

test("the confidence section draws its gauges and the stretches each date led", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.confidence).click();

  await expect(page.locator("[data-chart='confidence'] svg.apexcharts-svg")).toHaveCount(2);
  await expect(page.locator("[data-chart='stretches-led'] svg.apexcharts-svg")).toHaveCount(1);

  // One column per SIP date, and the one marked is the day the headline names.
  const items = page.locator("[data-chart='stretches-led'] [data-led-date]");
  await expect(items).toHaveCount(28);
  const marked = page.locator("[data-chart='stretches-led'] [data-led-date]", { hasText: "the named day" });
  await expect(marked).toHaveCount(1);
  const heading = (await page.locator("#answer-heading").textContent()) ?? "";
  expect(heading).toContain(String(await marked.getAttribute("data-led-date")));
  expect(errors).toEqual([]);
});

test("the what-matters bars set a date's worth beside one missed instalment", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto(`/f/${KOTAK.code}`);
  await ready(page);
  await trigger(page, TRIGGERS.matters).click();

  const chart = page.locator("[data-chart='matters']");
  await expect(chart.locator("svg.apexcharts-svg")).toHaveCount(1);
  await expect(chart).toContainText(/Missing one instalment cost ₹[\d,]+/);
  await expect(chart).toContainText(/Picking the \d+(st|nd|rd|th) over a typical day/);
  expect(errors).toEqual([]);
});
