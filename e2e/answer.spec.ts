import { expect, test } from "@playwright/test";

/**
 * The answer, in a browser: the page names the SIP day with the highest full-history XIRR,
 * the calendar prints every day's figure, and the shading compares each one to today.
 *
 * These run against real published funds on `wrangler dev`. A nightly refresh moves the
 * numbers, so almost nothing here asserts which date won — the assertions are that the page
 * agrees with itself and with the rule, both of which survive any refresh.
 */

const KOTAK = { code: 119775, name: "Kotak Mid Cap Fund - Direct Plan - Growth" };

/** 40 months of history: the shortest fund the planner covers. */
const SHORT = {
  code: 151713,
  name: "quant Dynamic Asset Allocation Fund - Direct Plan - Growth Option",
};

/**
 * The grid is `aria-hidden`, so it exposes no roles to query and its numerals are not
 * accessible text. These attributes are the contract that makes it testable: every cell carries
 * `data-date`, the 29th onwards carry `data-unavailable`, the named day carries `data-answer`,
 * today carries `data-baseline`, and every SIP cell carries `data-direction`.
 */
const SIP_CELLS = "[data-date]:not([data-unavailable])";
const ANSWER_CELL = "[data-date][data-answer]";

/** SIP dates run 1 to 28, in every month, forever. */
const SIP_DATES = 28;

/** The answer heading is the ordinal alone, so matching it exactly can't catch a caveat. */
const ANSWER_HEADING = /^The \d+(st|nd|rd|th)$/;

/** React reports a hydration mismatch through console.error, so nothing may be logged. */
function watchForErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const answerHeading = (page: import("@playwright/test").Page) => page.locator("#answer-heading");

/**
 * The gate the plain evaluations below depend on. The calendar is clock-dependent and renders
 * after mount, so a page caught mid-render fails here rather than handing half a month to a
 * comparison.
 */
async function settled(page: import("@playwright/test").Page): Promise<void> {
  await expect(answerHeading(page)).toHaveText(ANSWER_HEADING);
  await expect(page.locator(SIP_CELLS)).toHaveCount(SIP_DATES);
  await expect(page.locator(ANSWER_CELL)).toHaveCount(1);
}

/** Every SIP cell as the grid renders it: its date, its printed figure and its shading. */
function cells(page: import("@playwright/test").Page) {
  return page.locator(SIP_CELLS).evaluateAll((nodes) =>
    nodes.map((node) => ({
      date: Number(node.getAttribute("data-date")),
      direction: node.getAttribute("data-direction"),
      isAnswer: node.hasAttribute("data-answer"),
      isBaseline: node.hasAttribute("data-baseline"),
      // The figure is the last line of the cell; the first is the day number.
      figure: (node.textContent ?? "").trim(),
    })),
  );
}

/** "The 26th" -> 26, so the sentence and the grid can be compared as numbers. */
async function answerFromHeading(page: import("@playwright/test").Page): Promise<number> {
  const text = (await answerHeading(page).textContent()) ?? "";
  return Number.parseInt(text.replace("The ", ""), 10);
}

/** "26" plus "20.389" as one string -> 20.389. U+2212 is the minus the page prints. */
function figureOf(cell: { date: number; figure: string }): number {
  const rate = cell.figure.slice(String(cell.date).length);
  return Number(rate.replace("−", "-"));
}

test("names the SIP day with the highest full-history XIRR", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  const grid = await cells(page);
  const answer = grid.find((cell) => cell.isAnswer);
  const highest = Math.max(...grid.map(figureOf));

  expect(answer).toBeDefined();
  expect(figureOf(answer!)).toBe(highest);
  // The ring and the sentence under it are two renderings of one pick; a reader who trusts the
  // picture and a reader who trusts the words must act the same way.
  expect(answer!.date).toBe(await answerFromHeading(page));
  expect(errors).toEqual([]);
});

test("prints a figure on every SIP date, and none on the days that are not SIP dates", async ({
  page,
}) => {
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  for (const cell of await cells(page)) {
    expect(Number.isFinite(figureOf(cell)), `date ${cell.date}: ${cell.figure}`).toBe(true);
  }

  // A 30- or 31-day month draws its last days greyed and empty. February draws none at all,
  // so this asserts what is true of whichever cells exist rather than that any do.
  const inert = await page
    .locator("[data-date][data-unavailable]")
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()));
  for (const text of inert) expect(Number(text)).toBeGreaterThan(SIP_DATES);
});

test("shades against today: higher is green, lower is red, today itself neutral", async ({
  page,
}) => {
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  const grid = await cells(page);
  const baseline = grid.find((cell) => cell.isBaseline);

  // Today is always a SIP date, because the 29th to 31st clamp back to the 28th.
  expect(baseline, "no cell marked as today").toBeDefined();
  expect(baseline!.direction).toBe("level");

  const baselineFigure = figureOf(baseline!);
  for (const cell of grid) {
    const figure = figureOf(cell);
    const expected = figure > baselineFigure ? "up" : figure < baselineFigure ? "down" : "level";
    expect(cell.direction, `date ${cell.date} at ${figure} against ${baselineFigure}`).toBe(expected);
  }
});

test("offers no salary or buffer control, and no longer asks when you are paid", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  await expect(page.getByLabel("Salary arrives")).toHaveCount(0);
  await expect(page.getByText(/adjust buffer/i)).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/salary/i);
  await expect(page.getByRole("main")).not.toContainText(/your window/i);

  // Search is the typeahead; "I SIP on" is a native select for comparing a date.
  await expect(page.getByRole("combobox", { name: "Search for a fund" })).toHaveCount(1);
  await expect(page.getByLabel(/I SIP on the/)).toBeVisible();
});

test("ignores salary and buffer in the URL rather than answering differently", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);
  const plain = await answerFromHeading(page);

  // Old links stay working. They just no longer mean anything.
  for (const query of ["?salary=15", "?buffer=7", "?salary=20&buffer=0"]) {
    await page.goto(`/f/${KOTAK.code}${query}`);
    await settled(page);
    expect(await answerFromHeading(page), query).toBe(plain);
  }

  expect(errors).toEqual([]);
});

test("a fund with 40 months of history says so instead of naming a date effect", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${SHORT.code}`);
  await expect(page.getByRole("heading", { level: 1, name: SHORT.name })).toBeVisible();

  // The fund's verdict is "marginal" on a spread a 40-month history produces on its own, so the
  // length of the history has to outrank the verdict in the copy.
  await expect(page.getByText(/40 months of history is too little to tell/)).toBeVisible();

  // "No crash" is the other half: the answer still renders, fully formed.
  await settled(page);
  expect(errors).toEqual([]);
});

test("tells a screen reader the day, since the calendar is hidden from it", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  const date = await answerFromHeading(page);
  const suffix = ["th", "st", "nd", "rd"][date % 10 > 3 || (date > 10 && date < 14) ? 0 : date % 10];
  await expect(page.getByRole("main")).toContainText(`Best SIP day: the ${date}${suffix}.`);
});

test("a keyboard-only reader can search a fund and land on its answer", async ({ page }) => {
  const errors = watchForErrors(page);

  // Start on a fund page: the field autofocuses on the home page, which would make "/" a
  // keystroke into the field rather than the shortcut being tested.
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  await page.keyboard.press("/");
  const field = page.getByRole("combobox", { name: "Search for a fund" });
  await expect(field).toBeFocused();

  await page.keyboard.type("quant dynamic asset");
  await expect(page.getByRole("option").first()).toContainText("quant Dynamic Asset Allocation");
  await page.keyboard.press("Enter");

  // No parameters on the way out: a fund link is just the fund.
  await expect(page).toHaveURL(new RegExp(`/f/${SHORT.code}$`));
  await expect(page.getByRole("heading", { level: 1, name: SHORT.name })).toBeVisible();

  // Focus moves to the answer after a selection. Without this the reader is returned to the top
  // of the document and has to tab past the search field to reach what they just asked for.
  await expect(answerHeading(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("shows a verdict chip and compares a tapped SIP date without changing the named day", async ({ page }) => {
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  const named = await answerFromHeading(page);
  await expect(page.locator("[data-verdict]")).toHaveAttribute("data-verdict", /noise|marginal|meaningful/);

  const other = named === 5 ? 6 : 5;
  await page.locator(`${SIP_CELLS}[data-date="${other}"]`).click();
  await expect(page.locator("[data-compare-copy]")).toContainText(new RegExp(`${other}(st|nd|rd|th)`));
  await expect(page.locator(`[data-date="${other}"][data-compare]`)).toHaveCount(1);
  await expect(answerHeading(page)).toHaveText(ANSWER_HEADING);
});
