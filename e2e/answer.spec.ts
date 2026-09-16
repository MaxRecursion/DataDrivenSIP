import { expect, test } from "@playwright/test";

/**
 * Phase 5's gate: criteria 4 and 5, plus the parts of the answer that only a browser can
 * prove — the grid and the heading naming the same date, the URL carrying the salary, and
 * focus landing on the answer after a selection (PLAN.md §6.4, §6.6, §13).
 *
 * These run against real published funds on `wrangler dev`. A nightly refresh moves the
 * numbers, so nothing here asserts which date the engine liked: the assertions are about the
 * window, which is a pure function of the params, and about the page agreeing with itself.
 */

const KOTAK = { code: 119775, name: "Kotak Mid Cap Fund - Direct Plan - Growth" };

/** 40 months of history: criterion 5's fund, and the shortest one the planner covers. */
const SHORT = {
  code: 151713,
  name: "quant Dynamic Asset Allocation Fund - Direct Plan - Growth Option",
};

/** Mirrors WINDOW_LENGTH in src/lib/window.ts. The e2e suite imports nothing from the app. */
const WINDOW_LENGTH = 10;

/**
 * The windows D6 produces for the params used below. They can be written down as literals
 * because they depend only on salary and buffer: no NAV refresh can move them, and they are
 * the same numbers the unit tests check the window function against.
 */
const DEFAULT_WINDOW = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SALARY_15_WINDOW = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
const SALARY_20_WINDOW = [22, 23, 24, 25, 26, 27, 28, 1, 2, 3];

/**
 * The grid is `aria-hidden` (PLAN.md §6.6), so it exposes no roles to query and its numerals
 * are not accessible text. These attributes are the contract that makes it testable: every
 * cell carries `data-date`, the ten cells of the window carry `data-in-window`, and the one
 * answer cell carries `data-answer` alongside both of those.
 */
const WINDOW_CELLS = "[data-date][data-in-window]";
const ANSWER_CELL = "[data-date][data-answer]";

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

const answerHeading = (page: import("@playwright/test").Page) => page.getByText(ANSWER_HEADING);

/**
 * The reads below are plain evaluations rather than web-first assertions, so they don't retry.
 * This is the gate that has to pass before they run: a window is only ever ten cells with
 * exactly one answer among them, so a grid caught mid-update fails here instead of handing
 * half a window to a comparison.
 */
async function settled(page: import("@playwright/test").Page): Promise<void> {
  await expect(answerHeading(page)).toBeVisible();
  await expect(page.locator(WINDOW_CELLS)).toHaveCount(WINDOW_LENGTH);
  await expect(page.locator(ANSWER_CELL)).toHaveCount(1);
}

/** The dates the grid is actually highlighting, in the order its cells appear. */
function windowCells(page: import("@playwright/test").Page): Promise<number[]> {
  return page
    .locator(WINDOW_CELLS)
    .evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute("data-date"))));
}

/**
 * The grid is a calendar: it runs the 1st to the 28th in order however the window wraps, so
 * salary on the 20th lights 22-28 and 1-3 and the DOM hands them back as 1,2,3,22...28. Window
 * order is what D6 produces and what the constants above record; which cells are lit is all the
 * grid can say. So compare membership, not sequence.
 */
function sameDates(actual: number[], expected: number[]): void {
  const ascending = (dates: number[]) => [...dates].sort((a, b) => a - b);
  expect(ascending(actual)).toEqual(ascending(expected));
}

async function answerCell(page: import("@playwright/test").Page): Promise<number> {
  return Number(await page.locator(ANSWER_CELL).getAttribute("data-date"));
}

/** "The 25th" -> 25, so the sentence and the grid can be compared as numbers. */
async function answerFromHeading(page: import("@playwright/test").Page): Promise<number> {
  const text = (await answerHeading(page).textContent()) ?? "";
  return Number.parseInt(text.replace("The ", ""), 10);
}

test("changing the salary day moves the answer into the window that salary allows", async ({
  page,
}) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);
  sameDates(await windowCells(page), DEFAULT_WINDOW);

  const heading = answerHeading(page);
  const before = (await heading.textContent()) ?? "";

  await page.getByLabel("Salary arrives").selectOption({ label: "15th" });

  // A salary change replaces the history entry rather than pushing one, but the URL still has
  // to carry it: the link in the address bar is the state (PLAN.md §6.1).
  await expect(page).toHaveURL(/[?&]salary=15(?:&|$)/);

  // Criterion 4. The 15th's window shares no date with the default one, and the pick is always
  // inside the window, so the date has to move whatever this week's data says — the test never
  // needs to know which date either window produced.
  await expect(heading).not.toHaveText(before);
  await settled(page);

  sameDates(await windowCells(page), SALARY_15_WINDOW);
  expect(SALARY_15_WINDOW).toContain(await answerCell(page));
  expect(await answerCell(page)).toBe(await answerFromHeading(page));
  expect(errors).toEqual([]);
});

/**
 * Never selecting a date outside the window is a non-negotiable, and the grid is where a
 * reader would see it broken. These three cover the plain case, a window that wraps past the
 * 28th, and a fund with almost no rolling windows to rank dates by.
 */
const PLACES = [
  { what: "the default window", path: `/f/${KOTAK.code}`, window: DEFAULT_WINDOW },
  { what: "a window that wraps past the 28th", path: `/f/${KOTAK.code}?salary=20`, window: SALARY_20_WINDOW },
  { what: "a fund with only five rolling windows", path: `/f/${SHORT.code}`, window: DEFAULT_WINDOW },
];

for (const place of PLACES) {
  test(`the date the page names is one of the highlighted cells in ${place.what}`, async ({ page }) => {
    const errors = watchForErrors(page);

    await page.goto(place.path);
    await settled(page);

    sameDates(await windowCells(page), place.window);

    const answer = await answerCell(page);
    expect(place.window).toContain(answer);
    // The marigold cell and the sentence under the grid are two renderings of one pick; a
    // reader who trusts the picture and a reader who trusts the words must act the same way.
    expect(answer).toBe(await answerFromHeading(page));
    expect(errors).toEqual([]);
  });
}

test("a fund with 40 months of history says so instead of naming a date effect", async ({ page }) => {
  const errors = watchForErrors(page);

  await page.goto(`/f/${SHORT.code}`);

  await expect(page.getByRole("heading", { level: 1, name: SHORT.name })).toBeVisible();

  // Criterion 5. This fund's verdict is "marginal" on a spread a 40-month history produces on
  // its own, so reduced confidence has to outrank the verdict in the copy (PLAN.md D7, D21).
  await expect(page.getByText(/40 months of history, too little to tell/)).toBeVisible();

  // "No crash" is the other half of the criterion: the answer still renders, fully formed.
  await settled(page);
  expect(errors).toEqual([]);
});

test("a cold deep link with a salary renders that salary's window, not the default one", async ({
  page,
}) => {
  const errors = watchForErrors(page);

  // Prerendered HTML carries the default params, so this page has to render from scratch and
  // still land on 17-26. A window of 3-12 here would mean the pending-params path failed.
  await page.goto(`/f/${KOTAK.code}?salary=15`);
  await settled(page);

  sameDates(await windowCells(page), SALARY_15_WINDOW);
  expect(SALARY_15_WINDOW).toContain(await answerCell(page));

  // The grid is aria-hidden, so this sentence is the entire answer for a screen reader. It has
  // to name the same window and the same date the grid paints (PLAN.md §6.6).
  const date = await answerFromHeading(page);
  const main = page.getByRole("main");
  await expect(main).toContainText("Your window: 17th to 26th.");
  await expect(main).toContainText(`Your date: the ${date}`);

  expect(errors).toEqual([]);
});

test("a keyboard-only reader can search a fund and land on its answer", async ({ page }) => {
  const errors = watchForErrors(page);

  // Start on a fund page: the field autofocuses on the home page, which would make "/" a
  // keystroke into the field rather than the shortcut being tested.
  await page.goto(`/f/${KOTAK.code}`);
  await settled(page);

  await page.keyboard.press("/");
  // The salary <select> is a combobox too, so this has to name the field it means.
  const field = page.getByRole("combobox", { name: "Search for a fund" });
  await expect(field).toBeFocused();

  await page.keyboard.type("quant dynamic asset");
  await expect(page.getByRole("option").first()).toContainText("quant Dynamic Asset Allocation");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/f/${SHORT.code}$`));
  await expect(page.getByRole("heading", { level: 1, name: SHORT.name })).toBeVisible();

  // PLAN.md §6.6: focus moves to the answer after a selection. Without this the reader is
  // returned to the top of the document and has to tab past the search field to reach what
  // they just asked for.
  await expect(answerHeading(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("the compliance footer travels with the fund page and dates the NAVs it used", async ({
  page,
}) => {
  await page.goto(`/f/${KOTAK.code}`);

  // Both are required on every page (CLAUDE.md), and the NAV date is what stops a stale page
  // from reading as current.
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText(/NAVs up to \d{1,2} [A-Z][a-z]+ \d{4}\./);
  await expect(footer).toContainText("Not investment advice.");
  await expect(footer).toContainText("Not registered with SEBI.");
});
