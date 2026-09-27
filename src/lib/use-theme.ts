/**
 * The theme service's live half: one tiny store, and the hook the control reads it through.
 *
 * Kept out of `theme.ts` so that module stays pure and testable without a DOM. Everything here
 * is the part that has to touch the browser: storage, the `prefers-color-scheme` query, the two
 * attributes on `<html>`, and the other tabs that may have changed the choice already.
 *
 * Hydration: `getServerSnapshot` hands React the default choice, which is exactly what the
 * prerendered HTML was built with, so the markup matches and React re-renders with the real
 * choice straight after. The colours themselves are never waiting on that — the inline script in
 * `index.html` set the attributes before the first paint, and this store's job is only to tell
 * the control which button to mark as pressed.
 */
import { useSyncExternalStore } from "react";
import { browserStore } from "./memory";
import {
  DARK_QUERY,
  DEFAULT_CHOICE,
  applyChoice,
  readChoice as readStoredChoice,
  resolveMode,
  writeChoice as writeStoredChoice,
  type Choice,
  type Mode,
  type PaletteId,
  type Resolved,
} from "./theme";

export type ThemeState = Choice & { resolved: Resolved };

const SERVER_STATE: ThemeState = { ...DEFAULT_CHOICE, resolved: resolveMode(DEFAULT_CHOICE.mode, false) };

const serverSnapshot = (): ThemeState => SERVER_STATE;

const listeners = new Set<() => void>();

let state: ThemeState | null = null;
let prefersDark = false;

function media(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(DARK_QUERY);
}

/** Storage, with the fallback map `memory.ts` keeps for a browser that refuses access. */
const readChoice = (): Choice => readStoredChoice(browserStore());
const writeChoice = (choice: Choice): Choice => writeStoredChoice(choice, browserStore());

function stateFor(choice: Choice): ThemeState {
  return { ...choice, resolved: resolveMode(choice.mode, prefersDark) };
}

/** Publishes only when something actually moved, so a media change to the same answer is free. */
function publish(next: ThemeState): void {
  if (
    state !== null &&
    state.mode === next.mode &&
    state.palette === next.palette &&
    state.resolved === next.resolved
  ) {
    return;
  }
  state = next;
  apply();
  for (const listener of listeners) listener();
}

function apply(): void {
  if (state === null || typeof document === "undefined") return;
  applyChoice(document.documentElement, state, state.resolved);
}

/**
 * Reads storage and the OS preference the first time anyone asks, and starts listening. Idempotent:
 * `initTheme` calls it from the browser entry, and the hook calls it in case nothing else did.
 */
function current(): ThemeState {
  if (state !== null) return state;
  if (typeof window === "undefined") return SERVER_STATE;

  const query = media();
  prefersDark = query?.matches ?? false;
  query?.addEventListener("change", (event) => {
    prefersDark = event.matches;
    if (state !== null) publish(stateFor(state));
  });

  // Another tab's choice is this tab's choice too: the same reader, the same preference.
  window.addEventListener("storage", () => {
    publish(stateFor(readChoice()));
  });

  state = stateFor(readChoice());
  apply();
  return state;
}

/**
 * Brings `<html>` in line with what was stored, and sets the `theme-color` the inline script
 * couldn't. Called from `main.tsx`; safe to call more than once.
 */
export function initTheme(): void {
  current();
}

function subscribe(listener: () => void): () => void {
  current();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setMode(mode: Mode): void {
  const next = { ...current(), mode };
  writeChoice({ mode, palette: next.palette });
  publish(stateFor({ mode, palette: next.palette }));
}

export function setPalette(palette: PaletteId): void {
  const next = { ...current(), palette };
  writeChoice({ mode: next.mode, palette });
  publish(stateFor({ mode: next.mode, palette }));
}

export type ThemeControls = ThemeState & {
  setMode: (mode: Mode) => void;
  setPalette: (palette: PaletteId) => void;
};

export function useTheme(): ThemeControls {
  const snapshot = useSyncExternalStore(subscribe, current, serverSnapshot);
  // setMode and setPalette are module functions, so this object's handlers are already stable.
  return { ...snapshot, setMode, setPalette };
}

/**
 * The theme as one string, for the charts. A canvas reads its colours once, in an effect, so it
 * has to be told when to read them again — this is what goes in those effects' dependency lists,
 * and it changes on a mode switch and on a palette switch alike.
 */
export function useThemeKey(): string {
  const { palette, resolved } = useTheme();
  return `${palette}:${resolved}`;
}
