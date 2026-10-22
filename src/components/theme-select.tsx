/**
 * The theme control: light, dark or follow the system, and which of the four palettes paints it.
 *
 * Two groups of plain buttons rather than a menu. A menu would be a popover, a portal and a set
 * of animations to strip; this is seven buttons whose whole job is to write two attributes on
 * `<html>`. Both groups are `role="group"` with `aria-pressed` buttons rather than a radiogroup:
 * a radiogroup promises arrow-key navigation, and promising it without implementing it is worse
 * than not claiming it.
 *
 * Nothing here transitions. Pressing a button repaints the page in one frame because the colours
 * are static CSS keyed off those attributes (`src/styles/index.css`), and a colour transition is
 * banned anyway (CLAUDE.md). The only motion is the press itself, which is a transform.
 *
 * The swatches show each palette's own accent, positive and negative colours, taken from the same
 * table the stylesheet is generated from — so a palette can't be advertised in a colour it
 * doesn't paint with. They are inline styles because the values are data, not four hard-coded
 * classes, and because a swatch is the one place in the app that has to show a colour the rest of
 * the page is not currently using.
 *
 * Fixed widths on the mode buttons: the prerendered HTML is built for the default choice, so for
 * one frame after hydration a dark reader's page shows "Light" pressed. A control whose buttons
 * change size when that corrects itself would be a layout shift (D13: CLS 0).
 */
import { PALETTES, tokensFor, type Mode } from "../lib/theme";
import { useTheme } from "../lib/use-theme";
import { cn } from "../lib/utils";

const MODE_LABELS: ReadonlyArray<readonly [Mode, string]> = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Auto"],
];

const BUTTON =
  "rounded-lg px-2 py-1 text-xs leading-none text-mute-text transition-transform duration-100 active:scale-95 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-teal";

export function ThemeSelect({ className }: { className?: string }) {
  const { mode, palette, resolved, setMode, setPalette } = useTheme();

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <div role="group" aria-label="Theme" className="flex items-center gap-1 rounded-xl border border-line bg-raised p-1">
        {MODE_LABELS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-mode={value}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            // "Auto" is the only one whose meaning isn't on its face.
            title={value === "system" ? "Follow the system setting" : undefined}
            className={cn(
              BUTTON,
              "w-12 text-center",
              mode === value && "bg-surface font-bold text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="group"
        aria-label="Colour palette"
        className="flex items-center gap-1 rounded-xl border border-line bg-raised p-1"
      >
        {PALETTES.map((option) => {
          const tokens = tokensFor(option.id, resolved);
          return (
            <button
              key={option.id}
              type="button"
              data-palette-option={option.id}
              aria-pressed={palette === option.id}
              onClick={() => setPalette(option.id)}
              title={option.note}
              // The swatch is painted in the palette's own page colour, with its own accent,
              // positive and negative on top: four grey-on-grey buttons would say nothing about
              // what the page is going to look like.
              style={{ backgroundColor: tokens.surface }}
              className={cn(
                "flex size-7 items-center justify-center rounded-lg transition-transform duration-100 active:scale-95 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-teal",
                palette === option.id ? "border-2 border-ink" : "border border-line",
              )}
            >
              {/* Named for a screen reader; the colours themselves say nothing out loud. */}
              <span className="sr-only">{option.label}</span>
              <span aria-hidden="true" className="flex gap-px">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: tokens.marigold }} />
                <span className="size-1.5 rounded-full" style={{ backgroundColor: tokens.teal }} />
                <span className="size-1.5 rounded-full" style={{ backgroundColor: tokens.loss }} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
