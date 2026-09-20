import { expect, test } from "@playwright/test";

/**
 * The reveal caught at 0, 200, 400 and 700 ms (PLAN.md §8.4), so the choreography can be looked
 * at rather than taken on trust.
 *
 * Faithful rather than timed: every animation is paused through the CDP `Animation` domain
 * before the sequence starts, then seeked to each mark. A timed capture races the very thing it
 * is measuring and would show a different frame on every run and on every machine. §8.4 allows
 * timed captures as a fallback and asks that it be said at the gate; it wasn't needed.
 *
 * Skipped unless PERF=1, alongside the rest of the harness.
 */

const KOTAK = { code: 119775, query: "kotak mid" };
const OUT = "test-results/screens";
/** §8.2's marks: before anything, mid-arrival, the answer landing, and the end. */
const MARKS = [0, 200, 400, 700];

test.beforeEach(({}, testInfo) => {
  test.skip(!process.env.PERF, "Set PERF=1 to capture the reveal's frames");
  test.skip(testInfo.project.name !== "desktop", "One device is enough for choreography");
});

test.use({ viewport: { width: 390, height: 900 } });

test("the reveal, frozen at each of §8.2's marks", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  // Seeking needs the ids of the animations to seek, which only arrive as they are created.
  const started: string[] = [];
  cdp.on("Animation.animationStarted", ({ animation }) => started.push(animation.id));
  // Hold every animation still before the sequence can start, so seeking is exact rather than
  // a race against a clock.
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });

  await page.goto("/");
  await page.getByRole("combobox", { name: "Search for a fund" }).fill(KOTAK.query);
  await expect(page.getByRole("option").first()).toContainText("Kotak Mid Cap");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/f/${KOTAK.code}`));

  // The grid has to exist before there is anything to seek. Counted without the inert cells:
  // a real month also draws its 29th to 31st, which are never SIP dates.
  await expect(page.locator("[data-date]:not([data-unavailable])")).toHaveCount(28);

  for (const mark of MARKS) {
    await cdp.send("Animation.seekAnimations", { animations: started, currentTime: mark });
    await page.screenshot({ path: `${OUT}/reveal-${String(mark).padStart(3, "0")}ms.png` });
  }

  // Let it finish, so the last shot is the settled page rather than a paused one.
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/reveal-settled.png` });

  // The sequence is over: §8.2 caps it at 700 ms and nothing may outlive that.
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(page.locator("#answer-heading")).toHaveText(/^The \d+(st|nd|rd|th)$/);
});
