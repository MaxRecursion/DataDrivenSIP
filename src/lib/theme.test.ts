/**
 * The theme service, and the two things about it that can silently rot: the stylesheet drifting
 * from the palette table, and a palette shipping a colour pair nobody can read.
 *
 * The contrast rule here is worth stating plainly, because it isn't a flat "AA everywhere". The
 * palette the project shipped with — Marigold, light — was reviewed and approved as it is (D15),
 * and two of its pairs sit just under 4.5:1: `--loss` as text, and ink over the deepest calendar
 * fill. Tightening those would change the colours the user signed off, which needs their say-so,
 * not a test's. So each pair is held to AA where Marigold light reaches AA, and to Marigold
 * light's own figure where it doesn't. Nothing new can be worse than what shipped, and everything
 * that was already right stays right — in all eight combinations.
 */
import { describe, expect, it } from "vitest";
import {
  DARK_QUERY,
  DEFAULT_CHOICE,
  DEFAULT_PALETTE,
  MODES,
  NO_FLASH_SCRIPT,
  PALETTES,
  PALETTE_IDS,
  THEME_KEY,
  TOKEN_PROPERTIES,
  applyChoice,
  isMode,
  isPaletteId,
  paletteById,
  parseChoice,
  readChoice,
  resolveMode,
  serialiseChoice,
  tokensFor,
  type Tokens,
} from "./theme";
import type { ThemeStore } from "./theme";

function store(initial?: string): ThemeStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(THEME_KEY, initial);
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("modes", () => {
  it("resolves light and dark to themselves whatever the system says", () => {
    for (const prefersDark of [true, false]) {
      expect(resolveMode("light", prefersDark)).toBe("light");
      expect(resolveMode("dark", prefersDark)).toBe("dark");
    }
  });

  it("follows the system only under `system`", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });

  it("defaults to following the system, in the palette that shipped", () => {
    expect(DEFAULT_CHOICE).toEqual({ mode: "system", palette: "marigold" });
    expect(MODES).toEqual(["light", "dark", "system"]);
  });

  it("recognises its own values and nothing else", () => {
    expect(MODES.every(isMode)).toBe(true);
    expect(PALETTE_IDS.every(isPaletteId)).toBe(true);
    for (const junk of ["", "Dark", "auto", null, undefined, 0, {}]) {
      expect(isMode(junk)).toBe(false);
      expect(isPaletteId(junk)).toBe(false);
    }
  });
});

describe("the stored choice", () => {
  it("round-trips", () => {
    const written = { mode: "dark", palette: "indigo" } as const;
    const kept = store();
    kept.setItem(THEME_KEY, serialiseChoice(written));
    expect(readChoice(kept)).toEqual(written);
  });

  it("defaults when nothing is stored, and when what is stored is not JSON", () => {
    expect(readChoice(store())).toEqual(DEFAULT_CHOICE);
    expect(readChoice(store("{"))).toEqual(DEFAULT_CHOICE);
    expect(readChoice(store("null"))).toEqual(DEFAULT_CHOICE);
    expect(readChoice(store('"dark"'))).toEqual(DEFAULT_CHOICE);
    expect(readChoice(store("[]"))).toEqual(DEFAULT_CHOICE);
  });

  it("keeps the half it can trust", () => {
    expect(parseChoice('{"mode":"elephant","palette":"sandstone"}')).toEqual({
      mode: "system",
      palette: "sandstone",
    });
    expect(parseChoice('{"mode":"dark","palette":"elephant"}')).toEqual({
      mode: "dark",
      palette: DEFAULT_PALETTE,
    });
  });

  it("stores the two keys and nothing else, so an old record can't smuggle state in", () => {
    const kept = store();
    kept.setItem(THEME_KEY, JSON.stringify({ mode: "dark", palette: "indigo", salary: 25 }));
    expect(JSON.parse(serialiseChoice(readChoice(kept)))).toEqual({ mode: "dark", palette: "indigo" });
  });
});

describe("applying a choice", () => {
  /** A stand-in for `<html>` and its document: the two attributes, and the meta tag. */
  function fakeRoot() {
    const meta = { content: "", setAttribute: (_: string, value: string) => (meta.content = value) };
    return {
      dataset: {} as Record<string, string>,
      ownerDocument: { querySelector: (selector: string) => (selector.includes("theme-color") ? meta : null) },
      meta,
    };
  }

  it("writes the two attributes the stylesheet keys off", () => {
    const element = fakeRoot();
    applyChoice(element, { mode: "system", palette: "indigo" }, "dark");
    expect(element.dataset).toEqual({ theme: "dark", palette: "indigo" });
  });

  it("writes the resolved mode, never `system`", () => {
    const element = fakeRoot();
    applyChoice(element, { mode: "system", palette: "marigold" }, "light");
    expect(element.dataset.theme).toBe("light");
  });

  it("hands the browser's own chrome the surface it is actually painting", () => {
    const element = fakeRoot();
    applyChoice(element, { mode: "dark", palette: "sandstone" }, "dark");
    expect(element.meta.content).toBe(paletteById("sandstone").dark.surface);
  });
});

describe("the palette table", () => {
  it("has four palettes, the first of which is the default", () => {
    expect(PALETTES).toHaveLength(4);
    expect(PALETTES[0]?.id).toBe(DEFAULT_PALETTE);
  });

  it("leaves the palette that shipped untouched (D15)", () => {
    expect(paletteById("marigold").light).toEqual({
      ink: "#17203a",
      surface: "#eef0f4",
      raised: "#ffffff",
      marigold: "#f2a71b",
      teal: "#0e7c7b",
      loss: "#d65445",
      mute: "#7c8699",
      muteText: "#626b80",
      line: "#d6dbe4",
      // The calendar's fills were --teal and --loss before they were tokens of their own, and in
      // the light themes they still are exactly that.
      up: "#0e7c7b",
      down: "#d65445",
    });
  });

  it("gives every palette every token, as a six-digit lowercase hex", () => {
    for (const palette of PALETTES) {
      for (const tokens of [palette.light, palette.dark]) {
        for (const [key] of TOKEN_PROPERTIES) {
          expect(tokens[key], `${palette.id}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("names each palette once, in sentence case, with a note short enough for a title", () => {
    expect(new Set(PALETTE_IDS).size).toBe(PALETTES.length);
    for (const palette of PALETTES) {
      expect(palette.label).toMatch(/^[A-Z][a-z]+$/);
      expect(palette.note.length).toBeLessThan(80);
    }
  });

  it("darkens rather than lightens on the dark side, for every palette", () => {
    for (const palette of PALETTES) {
      expect(luminance(palette.dark.surface), palette.id).toBeLessThan(luminance(palette.light.surface));
      expect(luminance(palette.dark.ink), palette.id).toBeGreaterThan(luminance(palette.light.ink));
      // A dark theme's card sits above its page, a light theme's the same way round.
      expect(luminance(palette.dark.raised), palette.id).toBeGreaterThan(luminance(palette.dark.surface));
      expect(luminance(palette.light.raised), palette.id).toBeGreaterThan(luminance(palette.light.surface));
    }
  });

  it("keeps green above and red below in all eight combinations", () => {
    // The calendar's caption says green was higher and red was lower (hero-grid.tsx). A palette
    // is a change of temperature, never of meaning, so `up` stays greener than `down` and `down`
    // redder than `up` — measured on the hue, not taken on trust.
    for (const palette of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        const { up, down } = palette[mode];
        const [ur, ug] = rgb(up);
        const [dr, dg] = rgb(down);
        expect(ug, `${palette.id} ${mode} up is green`).toBeGreaterThan(ur);
        expect(dr, `${palette.id} ${mode} down is red`).toBeGreaterThan(dg);
      }
    }
  });

  it("looks each palette up by id", () => {
    for (const palette of PALETTES) {
      expect(paletteById(palette.id)).toBe(palette);
      expect(tokensFor(palette.id, "light")).toBe(palette.light);
      expect(tokensFor(palette.id, "dark")).toBe(palette.dark);
    }
  });
});

// -----------------------------------------------------------------------------------------------
// Contrast

type RGB = readonly [number, number, number];

function rgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  }) as unknown as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** `fill` at `alpha` over `behind`, which is how the calendar paints a cell. */
function over(fill: string, behind: string, alpha: number): string {
  const front = rgb(fill);
  const back = rgb(behind);
  return `#${front
    .map((channel, index) => Math.round(channel * alpha + back[index]! * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** hero-grid.tsx's MAX_FILL, and the palest a shaded cell gets (MIN_INTENSITY × MAX_FILL). */
const MAX_FILL = 0.85;
const MIN_FILL = 0.12 * MAX_FILL;

/** [what it is, how to measure it, what AA asks of it]. */
const PAIRS: ReadonlyArray<readonly [string, (tokens: Tokens) => number, number]> = [
  ["ink on the page", (t) => contrast(t.ink, t.surface), 7],
  ["ink on a card", (t) => contrast(t.ink, t.raised), 7],
  ["small print on the page", (t) => contrast(t.muteText, t.surface), 4.5],
  ["small print on a card", (t) => contrast(t.muteText, t.raised), 4.5],
  ["a gain on a card", (t) => contrast(t.teal, t.raised), 4.5],
  ["a gain on the page", (t) => contrast(t.teal, t.surface), 4.5],
  ["a loss on a card", (t) => contrast(t.loss, t.raised), 4.5],
  ["a loss on the page", (t) => contrast(t.loss, t.surface), 4.5],
  ["a numeral on the deepest green cell", (t) => contrast(t.ink, over(t.up, t.raised, MAX_FILL)), 4.5],
  ["a numeral on the deepest red cell", (t) => contrast(t.ink, over(t.down, t.raised, MAX_FILL)), 4.5],
  ["a numeral on the palest green cell", (t) => contrast(t.ink, over(t.up, t.raised, MIN_FILL)), 4.5],
  ["a numeral on the palest red cell", (t) => contrast(t.ink, over(t.down, t.raised, MIN_FILL)), 4.5],
  ["a non-text mark on a card", (t) => contrast(t.mute, t.raised), 3],
  ["a non-text mark on the page", (t) => contrast(t.mute, t.surface), 3],
  ["the marked bar against the rest", (t) => contrast(t.marigold, t.line), 1.5],
  [
    "the two calendar fills against each other",
    (t) => contrast(over(t.up, t.raised, MAX_FILL), over(t.down, t.raised, MAX_FILL)),
    1.2,
  ],
  ["a card's hairline", (t) => contrast(t.line, t.raised), 1.15],
  ["a card against the page", (t) => contrast(t.raised, t.surface), 1.05],
];

describe("contrast", () => {
  const baseline = PALETTES[0]!.light;

  for (const palette of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      for (const [what, measure, aa] of PAIRS) {
        it(`${palette.id} ${mode}: ${what}`, () => {
          // AA where the palette that shipped reaches AA; its own figure where it doesn't. The
          // slack is for the rounding in an eight-bit channel, not for a judgement call.
          const floor = Math.min(aa, measure(baseline)) - 0.005;
          expect(measure(palette[mode])).toBeGreaterThanOrEqual(floor);
        });
      }
    }
  }
});

describe("the no-flash script", () => {
  it("names the same storage key and the same palettes as this module", () => {
    expect(NO_FLASH_SCRIPT).toContain(JSON.stringify(THEME_KEY));
    for (const id of PALETTE_IDS) expect(NO_FLASH_SCRIPT).toContain(`"${id}"`);
    expect(NO_FLASH_SCRIPT).toContain(`"${DEFAULT_PALETTE}"`);
  });

  it("cannot end the tag it sits in, and swallows its own failures", () => {
    // It runs before anything has painted, in a browser whose storage may throw on access: an
    // exception here would be a page with no theme at all.
    expect(NO_FLASH_SCRIPT.toLowerCase()).not.toContain("</script");
    expect(NO_FLASH_SCRIPT).toContain("catch");
  });

  it("reads the same media query the hook listens to", () => {
    expect(NO_FLASH_SCRIPT).toContain(DARK_QUERY);
  });
});
