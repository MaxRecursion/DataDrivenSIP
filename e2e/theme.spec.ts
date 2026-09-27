import { expect, test, type Page } from "@playwright/test";

/**
 * The theme, in a real browser: the part that unit tests can't reach.
 *
 * Three things matter here and nothing else does. The choice has to survive a reload and arrive
 * before the first paint — a dark reader seeing a white page for one frame is the failure this
 * whole design is arranged around. The palette has to actually repaint, which means the computed
 * colours have to change, not just an attribute. And the charts have to follow: each one reads its
 * colours out of the stylesheet once, into a canvas, so a stale chart is the one thing that can be
 * left behind by a switch.
 */

const KEY = "sip-date-planner.theme.v1";

const surface = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface").trim());

const attributes = (page: Page) =>
  page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    palette: document.documentElement.dataset.palette,
  }));

test.describe("choosing a theme", () => {
  test("switches to dark, and keeps it across a reload", async ({ page }) => {
    await page.goto("/f/119775");
    const light = await surface(page);

    await page.getByRole("button", { name: "Dark", exact: true }).click();
    expect(await attributes(page)).toMatchObject({ theme: "dark" });
    const dark = await surface(page);
    expect(dark).not.toBe(light);

    // The browser's own chrome follows the page, not just the page.
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", dark);

    await page.reload();
    expect(await attributes(page)).toMatchObject({ theme: "dark" });
    expect(await surface(page)).toBe(dark);
    await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("is in place before the page paints, not after hydration", async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [KEY, JSON.stringify({ mode: "dark", palette: "indigo" })],
    );

    // Recorded from the document itself, the moment the parser reaches the body — before any
    // module script has run, and so before anything React does.
    await page.addInitScript(() => {
      document.addEventListener(
        "readystatechange",
        () => {
          const root = document.documentElement;
          (window as unknown as { seen?: string }).seen ??= `${root.dataset.theme}:${root.dataset.palette}`;
        },
        { once: true },
      );
    });

    await page.goto("/f/119775");
    expect(await page.evaluate(() => (window as unknown as { seen?: string }).seen)).toBe("dark:indigo");
  });

  test("follows the system when asked to", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/f/119775");
    expect(await attributes(page)).toMatchObject({ theme: "dark", palette: "marigold" });

    await page.getByRole("button", { name: "Light", exact: true }).click();
    expect(await attributes(page)).toMatchObject({ theme: "light" });

    // Back to Auto, and the system's answer applies again — including a later change of mind.
    await page.getByRole("button", { name: "Auto", exact: true }).click();
    expect(await attributes(page)).toMatchObject({ theme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");
  });
});

test.describe("choosing a palette", () => {
  test("repaints, and the mode choice is untouched", async ({ page }) => {
    await page.goto("/f/119775");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    const before = await surface(page);

    await page.getByRole("button", { name: "Sandstone" }).click();
    expect(await attributes(page)).toMatchObject({ theme: "dark", palette: "sandstone" });
    expect(await surface(page)).not.toBe(before);

    expect(await page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBe(
      JSON.stringify({ mode: "dark", palette: "sandstone" }),
    );
  });

  test("offers every palette exactly once, each one named", async ({ page }) => {
    await page.goto("/");
    const swatches = page.locator("[data-palette-option]");
    await expect(swatches).toHaveCount(4);
    for (const name of ["Marigold", "Indigo", "Sandstone", "Graphite"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(1);
    }
  });
});

test.describe("the calendar and the charts", () => {
  test("the calendar's fills are the theme's, not the last theme's", async ({ page }) => {
    await page.goto("/f/119775");
    await expect(page.locator("[data-date]:not([data-unavailable])")).toHaveCount(28);

    /** The fill layer's own colour, from a cell that is painted at all. */
    const fill = () =>
      page.evaluate(() => {
        const cell = document.querySelector("[data-date][data-direction='up'], [data-date][data-direction='down']");
        const layer = cell?.querySelector("[style*='opacity']");
        return layer ? getComputedStyle(layer).backgroundColor : null;
      });

    const light = await fill();
    expect(light).not.toBeNull();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    expect(await fill()).not.toBe(light);
  });

  test("an open chart redraws when the theme changes", async ({ page }) => {
    await page.goto("/f/119775");
    await page.getByRole("button", { name: /The full curve/ }).click();
    await expect(page.locator("[data-spread-chart] canvas").first()).toBeVisible();

    /** uPlot paints into a canvas, so a stale chart is invisible to the DOM. Read the pixels. */
    const pixels = () =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>("[data-spread-chart] canvas");
        return canvas?.toDataURL().slice(-2000) ?? null;
      });

    const light = await pixels();
    expect(light).not.toBeNull();
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect.poll(pixels).not.toBe(light);
  });
});
