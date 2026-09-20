import { expect, test } from "@playwright/test";

/**
 * The reveal's performance harness (PLAN.md §8.4) and acceptance criterion 7 (D11).
 *
 * D11 is explicit that headless Chromium cannot render at 120 Hz and that the automated gate is
 * therefore a proxy: no main-thread task over 8.33 ms while the sequence runs at 1× CPU, with a
 * 4× run reported alongside. The final word is a trace from a real 120 Hz device, which is the
 * user's to take.
 *
 * The composited-layer check is done by reading the keyframes of the animations that are
 * actually running, rather than by counting layers. That tests the rule itself — animate
 * transform and opacity only — and the rule is precisely why these can leave the main thread.
 *
 * Skipped unless PERF=1: a throttled run takes seconds and the numbers are noisy on a shared CI
 * box, which is exactly the kind of flaky gate everyone learns to re-run.
 */

const KOTAK = { code: 119775, query: "kotak mid" };
/** One frame at 120 Hz (D11). */
const FRAME_BUDGET_MS = 8.33;
/** §8.2 caps the sequence here. */
const SEQUENCE_MS = 700;

declare global {
  interface Window {
    __longTasks?: number[];
    __frameGaps?: number[];
  }
}

test.beforeEach(({}, testInfo) => {
  test.skip(!process.env.PERF, "Set PERF=1 to run the performance harness");
  test.skip(testInfo.project.name !== "desktop", "One device is enough for a frame budget");
});

/** Records main-thread long tasks and frame intervals from before the page's own scripts run. */
async function instrument(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    window.__longTasks = [];
    window.__frameGaps = [];

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks?.push(entry.duration);
    }).observe({ entryTypes: ["longtask"] });

    let previous = 0;
    const tick = (now: number) => {
      if (previous) window.__frameGaps?.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function chooseFund(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Search for a fund" }).fill(KOTAK.query);
  await expect(page.getByRole("option").first()).toContainText("Kotak Mid Cap");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/f/${KOTAK.code}`));
}

type Stats = { longTasks: number[]; frames: number[] };

async function reveal(page: import("@playwright/test").Page, cpuThrottle: number): Promise<Stats> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });

  await instrument(page);
  await chooseFund(page);
  await page.waitForTimeout(SEQUENCE_MS + 300);

  const stats = await page.evaluate(() => ({
    longTasks: window.__longTasks ?? [],
    frames: window.__frameGaps ?? [],
  }));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return stats;
}

const report = (label: string, { longTasks, frames }: Stats) => {
  const worst = longTasks.length > 0 ? Math.max(...longTasks) : 0;
  const median = [...frames].sort((a, b) => a - b)[Math.floor(frames.length / 2)] ?? 0;
  // Against the refresh rate actually observed, not against the 120 Hz budget. Headless Chromium
  // renders at 60 Hz (D11 says so), where a 16.7 ms gap is a frame delivered on time; counting
  // those as drops reported fifty of them on a run that dropped none.
  const dropped = frames.filter((gap) => gap > median * 1.5).length;
  console.log(
    `${label}: ${frames.length} frames, median gap ${median.toFixed(1)} ms ` +
      `(${(1000 / median).toFixed(0)} Hz), ${longTasks.length} long tasks, ` +
      `worst ${worst.toFixed(1)} ms, ${dropped} late frames`,
  );
  return { worst, dropped };
};

test("criterion 7: no main-thread task exceeds a 120 Hz frame during the reveal", async ({ page }) => {
  const stats = await reveal(page, 1);
  const { worst } = report("1x CPU", stats);

  expect(stats.frames.length).toBeGreaterThan(10);
  expect(worst).toBeLessThanOrEqual(FRAME_BUDGET_MS);
});

test("the same run at 4x CPU, reported rather than gated (D11)", async ({ page }) => {
  const stats = await reveal(page, 4);
  report("4x CPU", stats);

  // Deliberately no assertion on the budget: a four-times-slower machine is information for the
  // gate, not a pass/fail. What is asserted is that the reveal still finishes and still runs.
  expect(stats.frames.length).toBeGreaterThan(10);
});

test("everything that animates touches only opacity and transform", async ({ page }) => {
  await chooseFund(page);

  // Read the animations that are genuinely running, mid-sequence. This is the non-negotiable
  // itself, and the reason any of this can leave the main thread.
  const properties = await page.evaluate(() => {
    const seen = new Set<string>();
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect)) continue;
      for (const frame of effect.getKeyframes()) {
        for (const key of Object.keys(frame)) seen.add(key);
      }
    }
    return [...seen];
  });

  const allowed = new Set(["opacity", "transform", "offset", "easing", "composite", "computedOffset"]);
  expect(properties.length).toBeGreaterThan(0);
  expect(properties.filter((property) => !allowed.has(property))).toEqual([]);
});
