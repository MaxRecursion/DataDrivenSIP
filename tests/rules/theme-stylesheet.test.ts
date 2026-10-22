/**
 * The theme table has three copies of itself, and two of them are files this test reads.
 *
 * The colours live in `src/lib/theme.ts`, because the swatches, the `theme-color` meta and the
 * contrast tests need the values. They are painted from static blocks in `src/styles/index.css`,
 * because that is what survives the first paint and costs nothing to switch. And the two
 * attributes that select a block are written by an inline script in `index.html`, because a dark
 * reader must not be shown a white page first.
 *
 * Nothing stops those three drifting apart except this file. It lives here rather than beside the
 * module because it reads files, and `src` is compiled without Node's types.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { themeCss } from "../../scripts/theme-css";
import { NO_FLASH_SCRIPT, PALETTE_IDS, THEME_KEY, TOKEN_PROPERTIES } from "../../src/lib/theme";

const root = join(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("src/styles/index.css", () => {
  const css = read("src/styles/index.css");

  it("carries the generated palette blocks verbatim", () => {
    // The message matters more than the assertion: whoever edits the table should be told to run
    // the generator, not left comparing a hundred and fifty lines by eye.
    expect(
      css.includes(themeCss()),
      "the palette blocks are stale — run `pnpm theme:css` and paste the output into src/styles/index.css",
    ).toBe(true);
  });

  it("gives every token a Tailwind colour, so none is reachable only as a raw var", () => {
    for (const [, property] of TOKEN_PROPERTIES) {
      expect(css, property).toContain(`${property.replace(/^--/, "--color-")}: var(${property});`);
    }
  });

  it("never transitions a colour, in any theme (CLAUDE.md)", () => {
    // Switching theme repaints in one frame on purpose. A transition on a custom property, or on
    // background-color, would animate something that is not transform or opacity — and would also
    // make the switch feel like a page reflow.
    const themed = css.slice(css.indexOf("theme:css start"), css.indexOf("theme:css end"));
    expect(themed).not.toMatch(/transition|animation/);
  });

  it("declares a colour-scheme for both modes, so form controls and scrollbars follow", () => {
    expect(css).toContain("color-scheme: light;");
    expect(css).toContain("color-scheme: dark;");
  });

  it("honours the system preference with no JavaScript at all, without outvoting a real choice", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark) {");
    expect(css).toContain(":root:not([data-theme]) {");
  });
});

describe("index.html", () => {
  const html = read("index.html");

  it("carries the no-flash script exactly as the module generates it", () => {
    expect(html).toContain(NO_FLASH_SCRIPT);
    expect(html.indexOf(NO_FLASH_SCRIPT)).toBeLessThan(html.indexOf("</head>"));
  });

  it("puts it ahead of anything that could paint", () => {
    // Vite adds the stylesheet link at build time and the prerender inlines it, so what this can
    // check is that nothing in the template's head comes first except metadata.
    const before = html.slice(0, html.indexOf(NO_FLASH_SCRIPT));
    expect(before).not.toContain("<link");
    expect(before).not.toContain("<body");
  });

  it("names the storage key and the palettes the module knows", () => {
    expect(html).toContain(THEME_KEY);
    for (const id of PALETTE_IDS) expect(html).toContain(`"${id}"`);
  });

  it("still ships a theme-color for the browser's own chrome to start from", () => {
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}" \/>/);
  });
});
