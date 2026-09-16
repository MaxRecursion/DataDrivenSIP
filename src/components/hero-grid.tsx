/**
 * The hero grid (PLAN.md §7): 28 cells read like a calendar, with the dates the user's window
 * allows in teal and the one answered date in marigold.
 *
 * Three things about this markup are load-bearing beyond how it looks.
 *
 * Every fill is a pre-painted overlay: an element that is always in the DOM and only ever
 * switched between opacity 0 and 1. That includes the numerals, which are stacked in two
 * colours rather than recoloured in place. Phase 6 animates this grid and may animate nothing
 * but opacity and transform, so no state here is allowed to depend on a colour changing.
 *
 * The height is reserved. Cells are squares in a seven-column grid, so the grid's height
 * follows from its width and from nothing else — it is identical before the fonts load,
 * before the fund's data arrives and after it lands, which is how CLS stays at 0 (PLAN.md §9).
 *
 * The grid is `aria-hidden` (PLAN.md §6.6). It restates in colour what the answer block states
 * in words, and the answer block carries the screen-reader summary, so a reader who met both
 * would hear the same fact twice with no way to tell them apart.
 */
import { cn } from "../lib/utils";

/** SIP dates are 1-28 only (CLAUDE.md), which is exactly four rows of seven. */
const DATES = Array.from({ length: 28 }, (_, index) => index + 1);

type HeroGridProps = {
  /** The dates the user's window allows, from `safeWindow()`. Order is irrelevant here. */
  window: number[];
  /**
   * The answered date, from `pickAnswer()`, or null while the fund's data is still in flight.
   * The null grid is the same size and carries the same window as the settled one — only the
   * marigold cell is missing — so the answer arriving never moves a pixel.
   */
  answer: number | null;
  /** Spacing from the caller. Cell sizing is fixed here and isn't meant to be overridden. */
  className?: string;
};

/**
 * One pre-painted fill. `on` picks its opacity and never whether it is rendered: a layer that
 * unmounted when it wasn't showing would leave Phase 6 nothing to fade.
 */
function Layer({ on, className }: { on: boolean; className: string }) {
  return (
    <div className={cn("absolute inset-0 rounded-lg", className, on ? "opacity-100" : "opacity-0")} />
  );
}

/** A numeral in one of its two colours. Both are always present; opacity chooses between them. */
function Numeral({ on, className, date }: { on: boolean; className: string; date: number }) {
  return (
    <span
      className={cn(
        // `leading-none` with flex centring keeps the glyph centred in the cell whichever of
        // Cabinet Grotesk and its metric-matched fallback is painting it.
        "absolute inset-0 flex items-center justify-center font-display text-lg leading-none font-bold tabular sm:text-2xl",
        className,
        on ? "opacity-100" : "opacity-0",
      )}
    >
      {date}
    </span>
  );
}

export function HeroGrid({ window: windowDates, answer, className }: HeroGridProps) {
  const allowed = new Set(windowDates);

  return (
    <div aria-hidden="true" className={className}>
      <div
        data-hero-grid=""
        className={cn(
          // 6 px gaps at 360 px, 8 px from sm up. The cap keeps desktop cells near 64 px rather
          // than letting seven of them stretch to the width of the text column.
          "grid w-full max-w-[496px] grid-cols-7 gap-1.5 sm:gap-2",
        )}
      >
      {DATES.map((date) => {
        const inWindow = allowed.has(date);
        const isAnswer = answer === date;
        // Marigold sits on top of teal rather than replacing it. The answer is always a window
        // date, so the teal underneath is correct, and Phase 6 gets to fade one over the other
        // instead of swapping a fill.
        return (
          <div
            key={date}
            data-date={date}
            // The grid is aria-hidden, so it has no roles to query. These are how the e2e suite
            // reads which cells are lit without depending on class names or colours.
            data-in-window={inWindow ? "" : undefined}
            data-answer={isAnswer ? "" : undefined}
            className="relative aspect-square rounded-lg bg-raised"
          >
            {/* D15: raised on surface is 1.14:1, so a neutral cell needs a hairline to exist.
                The fills below are opaque and cover it, which is why it can stay lit. */}
            <Layer on className="border border-line" />
            <Layer on={inWindow} className="bg-teal" />
            <Layer on={isAnswer} className="bg-marigold" />
            <Layer on={isAnswer} className="border-2 border-ink" />
            <Numeral on={!inWindow || isAnswer} className="text-ink" date={date} />
            <Numeral on={inWindow && !isAnswer} className="text-raised" date={date} />
          </div>
          );
        })}
      </div>

      {/*
       * Without this the grid is colour with no key: nothing else on the page says what teal
       * means. Static swatches, painted the same way the cells are, so there is still nothing
       * here for Phase 6 to animate but opacity. Inside the aria-hidden wrapper, because a
       * screen reader gets the same facts as a sentence from the answer block instead.
       */}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute-text">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-teal" />
          Your window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border-2 border-ink bg-marigold" />
          Your date
        </span>
      </p>
    </div>
  );
}
