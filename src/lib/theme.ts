/**
 * The theme service: light or dark, and which of four pre-defined palettes paints it.
 *
 * PLAN.md §7 said "no dark mode in v1". The user asked for one on 2026-09-27, with a palette
 * selector, so this is that amendment — and it is built the way the rest of the page is built,
 * which means the colours themselves are not in JavaScript's hands. Every palette in every mode
 * is a static block of custom properties in `src/styles/index.css`, keyed by `data-palette` and
 * `data-theme` on `<html>`. This module's job is to decide which two attributes go on that
 * element, persist that decision, and hold the token values so the swatches, the `theme-color`
 * meta and the contrast tests can read the same numbers the stylesheet paints with.
 *
 * That split is deliberate:
 *
 * - **No flash.** `index.html` carries `NO_FLASH_SCRIPT` in its `<head>`, ahead of the inlined
 *   stylesheet, so the attributes are set before the first paint rather than after hydration.
 *   The script is generated here and asserted against the file, so the two cannot drift.
 * - **No runtime painting.** Nothing here writes a colour into a style attribute. Switching
 *   theme flips two attributes and the cascade does the rest, which is also why the switch
 *   isn't animated: a colour transition is banned (CLAUDE.md), and a state change that isn't
 *   animated is fine.
 * - **Testable.** Pure functions over a `MemoryStore` and a plain element, so `theme.test.ts`
 *   checks the resolution rules, the stored shape, the CSS-to-token parity and the contrast of
 *   every pair in all eight combinations without a browser.
 *
 * The token names are the brand's (`--ink`, `--marigold`, `--teal`, `--loss`) and every palette
 * keeps them honest: the accent stays in the amber family, `teal` stays the positive colour and
 * `loss` the negative one. The calendar's caption says green is higher and red is lower
 * (`hero-grid.tsx`), so `up` and `down` — the two fill tokens — are green and red in all eight
 * combinations. A palette is a change of temperature and weight, never of meaning.
 */
export const THEME_KEY = "sip-date-planner.theme.v1";

/** What the reader chose. `system` follows the OS and keeps following it. */
export type Mode = "light" | "dark" | "system";
/** What `system` resolves to, and the only two things the stylesheet knows about. */
export type Resolved = "light" | "dark";
export type PaletteId = "marigold" | "indigo" | "sandstone" | "graphite";

export const MODES: readonly Mode[] = ["light", "dark", "system"];

/**
 * One palette in one mode. `up` and `down` are the calendar's fills, kept apart from `teal` and
 * `loss` because a fill has to stay legible under ink at 85% opacity while the text colours have
 * to clear 4.5:1 on a card — in dark mode those are different colours entirely.
 */
export type Tokens = {
  ink: string;
  surface: string;
  raised: string;
  marigold: string;
  teal: string;
  loss: string;
  mute: string;
  muteText: string;
  line: string;
  up: string;
  down: string;
};

export type Palette = {
  id: PaletteId;
  /** The swatch's accessible name. */
  label: string;
  /** One line, for the control's title. Sentence case, under 80 characters. */
  note: string;
  light: Tokens;
  dark: Tokens;
};

/** The CSS custom property each token is written to, and the order the stylesheet lists them in. */
export const TOKEN_PROPERTIES: ReadonlyArray<readonly [keyof Tokens, string]> = [
  ["ink", "--ink"],
  ["surface", "--surface"],
  ["raised", "--raised"],
  ["marigold", "--marigold"],
  ["teal", "--teal"],
  ["loss", "--loss"],
  ["mute", "--mute"],
  ["muteText", "--mute-text"],
  ["line", "--line"],
  ["up", "--up"],
  ["down", "--down"],
];

/**
 * The four palettes.
 *
 * Marigold's light column is the original palette, unchanged to the digit (D15): the default
 * theme of the default palette is the page as it shipped, so this feature adds a choice rather
 * than replacing what was reviewed. Every other column was picked against the contrast pairs
 * `theme.test.ts` enforces, not by eye.
 */
export const PALETTES: readonly Palette[] = [
  {
    id: "marigold",
    label: "Marigold",
    note: "The original: amber on cool grey.",
    light: {
      ink: "#17203a",
      surface: "#eef0f4",
      raised: "#ffffff",
      marigold: "#f2a71b",
      teal: "#0e7c7b",
      loss: "#d65445",
      mute: "#7c8699",
      muteText: "#626b80",
      line: "#d6dbe4",
      up: "#0e7c7b",
      down: "#d65445",
    },
    dark: {
      ink: "#e7ebf3",
      surface: "#10141f",
      raised: "#191f2c",
      marigold: "#f3b03a",
      teal: "#35b5a2",
      loss: "#ef7f70",
      mute: "#7f8798",
      muteText: "#a3abbd",
      line: "#2a3242",
      up: "#0e5852",
      down: "#6d2c25",
    },
  },
  {
    id: "indigo",
    label: "Indigo",
    note: "Cool blues under a gold accent.",
    light: {
      ink: "#1b2148",
      surface: "#eceef8",
      raised: "#ffffff",
      marigold: "#e59b12",
      teal: "#0f766e",
      loss: "#ce4257",
      mute: "#7a80a0",
      muteText: "#5f6585",
      line: "#d6d9ec",
      up: "#178a7c",
      down: "#e06a7c",
    },
    dark: {
      ink: "#e6e8f7",
      surface: "#0e1024",
      raised: "#181b34",
      marigold: "#f0b23c",
      teal: "#34b3a0",
      loss: "#f0788c",
      mute: "#7e85a8",
      muteText: "#a4aacd",
      line: "#2a2f52",
      up: "#10564f",
      down: "#6b2536",
    },
  },
  {
    id: "sandstone",
    label: "Sandstone",
    note: "Warm paper, brown ink.",
    light: {
      ink: "#2c2218",
      surface: "#f4efe6",
      raised: "#fffdf9",
      marigold: "#c2740e",
      teal: "#16706a",
      loss: "#b23a2c",
      mute: "#8a7d6c",
      muteText: "#6b604f",
      line: "#e0d6c6",
      up: "#2f8a72",
      down: "#d97159",
    },
    dark: {
      ink: "#f2ece0",
      surface: "#171310",
      raised: "#221c17",
      marigold: "#e0982e",
      teal: "#3bb09f",
      loss: "#e8806a",
      mute: "#8c8072",
      muteText: "#b0a595",
      line: "#362d24",
      up: "#10443f",
      down: "#803c26",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    note: "Neutral greys, nothing warm.",
    light: {
      ink: "#1c1c1e",
      surface: "#f1f1f2",
      raised: "#ffffff",
      marigold: "#a66b00",
      teal: "#0f6f68",
      loss: "#b3261e",
      mute: "#77777c",
      muteText: "#5c5c61",
      line: "#d5d5d8",
      up: "#12857b",
      down: "#d96a5c",
    },
    dark: {
      ink: "#eeeef0",
      surface: "#121214",
      raised: "#1c1c1f",
      marigold: "#e0a53c",
      teal: "#36ada0",
      loss: "#ef7a6b",
      mute: "#7c7c82",
      muteText: "#a8a8af",
      line: "#2c2c31",
      up: "#0e534d",
      down: "#6a241e",
    },
  },
];

export const PALETTE_IDS: readonly PaletteId[] = PALETTES.map((palette) => palette.id);

export const DEFAULT_PALETTE: PaletteId = "marigold";
/** `system` by default: the page arrives in whatever the reader's OS already asked for. */
export const DEFAULT_MODE: Mode = "system";

export type Choice = { mode: Mode; palette: PaletteId };

export const DEFAULT_CHOICE: Choice = { mode: DEFAULT_MODE, palette: DEFAULT_PALETTE };

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);
}

export function paletteById(id: PaletteId): Palette {
  // Non-null: `id` is one of PALETTE_IDS, which is derived from this same list.
  return PALETTES.find((palette) => palette.id === id)!;
}

export function tokensFor(id: PaletteId, resolved: Resolved): Tokens {
  const palette = paletteById(id);
  return resolved === "dark" ? palette.dark : palette.light;
}

/** `light` and `dark` are themselves; `system` is whatever the OS says at the time of asking. */
export function resolveMode(mode: Mode, prefersDark: boolean): Resolved {
  if (mode === "light" || mode === "dark") return mode;
  return prefersDark ? "dark" : "light";
}

/**
 * Whatever was in storage, read as far as it can be trusted and defaulted the rest of the way.
 * A half-valid record keeps its valid half: someone whose palette is intact but whose mode was
 * hand-edited to nonsense keeps their palette.
 */
export function parseChoice(raw: string | null): Choice {
  if (!raw) return DEFAULT_CHOICE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return DEFAULT_CHOICE;
    const record = parsed as Partial<Choice>;
    return {
      mode: isMode(record.mode) ? record.mode : DEFAULT_MODE,
      palette: isPaletteId(record.palette) ? record.palette : DEFAULT_PALETTE,
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function serialiseChoice(choice: Choice): string {
  return JSON.stringify({ mode: choice.mode, palette: choice.palette });
}

/**
 * What this module needs of a store, which `memory.ts`'s `MemoryStore` satisfies. Declared here
 * rather than imported so nothing in this file reaches for `localStorage`, or for the DOM: the
 * palette table has to be readable from `scripts/theme-css.ts` and from a Node test runner, and a
 * module that touches a browser global cannot be.
 */
export type ThemeStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

/**
 * As much of `<html>` as applying a theme touches. Structural for the same reason: a real
 * `HTMLElement` satisfies it, and so does a plain object in a test.
 */
export type ThemeTarget = {
  dataset: { [key: string]: string | undefined };
  ownerDocument: { querySelector: (selector: string) => { setAttribute: (name: string, value: string) => void } | null };
};

export function readChoice(store: ThemeStore): Choice {
  return parseChoice(store.getItem(THEME_KEY));
}

export function writeChoice(choice: Choice, store: ThemeStore): Choice {
  store.setItem(THEME_KEY, serialiseChoice(choice));
  return choice;
}

/**
 * Puts the decision on the element the stylesheet keys off, and brings the browser's own chrome
 * along with it. Nothing else: the colours arrive through the cascade.
 *
 * `theme-color` is the one value that has to be handed over as a literal, because the browser
 * paints its toolbar with it rather than reading a custom property. The no-flash script leaves
 * it alone — carrying a table of eight surfaces into every one of the 995 prerendered pages
 * costs more than the toolbar being one hydration late is worth.
 */
export function applyChoice(root: ThemeTarget, choice: Choice, resolved: Resolved): void {
  root.dataset.theme = resolved;
  root.dataset.palette = choice.palette;

  const meta = root.ownerDocument.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tokensFor(choice.palette, resolved).surface);
}

/**
 * The inline `<head>` script, verbatim as `index.html` carries it.
 *
 * It runs before the stylesheet the prerender inlines, so the very first paint is already in the
 * reader's theme — the alternative is a white page that turns dark after hydration, which is the
 * one thing a dark mode must not do. Generated from the constants above and asserted against the
 * file in `theme.test.ts`, so adding a palette cannot leave the script behind.
 *
 * Deliberately not a module and deliberately silent: it must run synchronously, before anything
 * paints, and a reader with storage switched off gets the default theme rather than an error.
 */
export const NO_FLASH_SCRIPT =
  `(function(){try{var r=document.documentElement,` +
  `c=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_KEY)})||"{}"),` +
  `p=c.palette,m=c.mode;` +
  `r.dataset.palette=${JSON.stringify(PALETTE_IDS)}.indexOf(p)>-1?p:${JSON.stringify(DEFAULT_PALETTE)};` +
  `r.dataset.theme=m==="light"||m==="dark"?m:` +
  `matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){}})();`;

/** The query the script and the hook both listen to, so they can never disagree about dark. */
export const DARK_QUERY = "(prefers-color-scheme: dark)";
