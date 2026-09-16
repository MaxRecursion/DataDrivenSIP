import { expect, test } from "@playwright/test";

/**
 * Criterion 1: "kotak mid" + Enter to a rendered date, median of 10 runs under 150 ms
 * (PLAN.md §9 "Selection → rendered answer", §13).
 *
 * The protocol is precise about both ends, because a looser measurement would flatter us:
 *
 *   Start — the Enter `keydown`'s own `event.timeStamp`, not a timestamp taken in the test
 *           process. Playwright's own call overhead is not part of what the reader waits for.
 *   End   — the answer heading's date is committed to the DOM *and* painted at computed
 *           opacity 1, detected with a MutationObserver plus one rAF. Text that exists but is
 *           still transparent is not an answer anyone can read.
 *
 * Warm-up per run matches §9: the results are rendered and the top hit's JSON has arrived
 * before Enter is pressed, so this measures selection, not a cold network fetch.
 *
 * Timing on a loaded CI box is noise, so this is skipped unless TIMING=1:
 *
 *   TIMING=1 pnpm exec playwright test e2e/criterion-1.spec.ts --project=desktop
 */

const KOTAK = 119775;
const RUNS = 10;
const BUDGET_MS = 150;

declare global {
  interface Window {
    __answerTiming?: { start: number; done: number };
  }
}

test.beforeEach(({}, testInfo) => {
  test.skip(!process.env.TIMING, "Set TIMING=1 to measure criterion 1");
  test.skip(testInfo.project.name !== "desktop", "One device is enough for a timing figure");
});

/**
 * Installed before any page script. The listener is capturing so it stamps the keydown before
 * the app's own handler runs, and the observer watches for the heading rather than polling,
 * so nothing here adds latency to what it is measuring.
 */
async function instrument(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const ordinal = /^The \d+(st|nd|rd|th)$/;

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;
        window.__answerTiming = { start: event.timeStamp, done: 0 };
      },
      true,
    );

    const observer = new MutationObserver(() => {
      const timing = window.__answerTiming;
      if (!timing || timing.start === 0 || timing.done !== 0) return;

      const heading = document.getElementById("answer-heading");
      if (!heading || !ordinal.test((heading.textContent ?? "").trim())) return;
      if (getComputedStyle(heading).opacity !== "1") return;

      // One frame later: committed to the DOM is not the same as on the screen.
      requestAnimationFrame(() => {
        if (window.__answerTiming && window.__answerTiming.done === 0) {
          window.__answerTiming.done = performance.now();
        }
      });
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true });
  });
}

/** One full selection: land on the home page, warm the index and the fund, then press Enter. */
async function measureOne(page: import("@playwright/test").Page): Promise<number> {
  await page.goto("/");

  // Set the waiter up before typing: the prefetch can land before we would start listening.
  const prefetched = page.waitForResponse(
    (response) => response.url().includes(`/funds/${KOTAK}.json`) && response.status() === 200,
  );

  const field = page.getByRole("combobox", { name: "Search for a fund" });
  await field.fill("kotak mid");
  await expect(page.getByRole("option").first()).toContainText("Kotak Mid Cap");
  await prefetched;

  await page.evaluate(() => {
    window.__answerTiming = { start: 0, done: 0 };
  });

  await field.press("Enter");

  await page.waitForFunction(() => (window.__answerTiming?.done ?? 0) > 0);
  return page.evaluate(() => {
    const timing = window.__answerTiming;
    return timing ? timing.done - timing.start : Number.NaN;
  });
}

test("criterion 1: a warm selection renders the date in under 150 ms", async ({ page }) => {
  await instrument(page);

  const samples: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    samples.push(await measureOne(page));
  }

  const sorted = [...samples].sort((a, b) => a - b);
  // Ten samples, so the median is the mean of the 5th and 6th.
  const median = ((sorted[4] ?? 0) + (sorted[5] ?? 0)) / 2;
  const slowest = sorted[sorted.length - 1] ?? 0;

  // The max is reported rather than gated (§9), because one scheduling hiccup on a laptop
  // running a browser and a worker is not what the criterion is about.
  console.log(
    `criterion 1 — median ${median.toFixed(1)} ms, max ${slowest.toFixed(1)} ms, ` +
      `all: ${sorted.map((ms) => ms.toFixed(0)).join(", ")}`,
  );

  expect(samples).toHaveLength(RUNS);
  expect(samples.every((ms) => Number.isFinite(ms) && ms > 0)).toBe(true);
  expect(median).toBeLessThan(BUDGET_MS);
});
