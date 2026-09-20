/**
 * The hero grid (PLAN.md §7): 28 cells read like a calendar, shaded by what each date returned,
 * with the ten your salary allows outlined and the one answered date in marigold.
 *
 * Four things about this markup are load-bearing beyond how it looks.
 *
 * Every fill is a pre-painted overlay: an element always in the DOM whose OPACITY carries the
 * value, never its colour. That is what makes the shading continuous without twenty-eight
 * different background colours, and it leaves Phase 6 something it is allowed to animate.
 *
 * The shading is relative to this fund's own range, because that is the only place variation
 * lives — the median fund's 28 dates span 0.094 percentage points. A ramp stretched across that
 * would be a lie told in colour, so the caption states the real distance underneath. Same
 * discipline §6.5 puts on the chart's zoomed axis, for the same reason.
 *
 * The window is an OUTLINE now that the fill carries the return. It has to stay visible: a
 * reader drawn to the darkest cell in the grid must be able to see that it is not one of the
 * dates their salary allows, or the picture argues against the one rule the app is built on.
 *
 * The grid is `aria-hidden` (§6.6). It restates in colour what the answer block states in words,
 * and that block carries the screen-reader summary.
 */
import type { CSSProperties } from "react";
import { formatPp, formatSignedPp } from "../lib/format";
import type { Heat } from "../lib/heat";
import { cn } from "../lib/utils";

/** SIP dates are 1-28 only (CLAUDE.md), which is exactly four rows of seven. */
const DATES = Array.from({ length: 28 }, (_, index) => index + 1);

/**
 * The strongest a cell paints. Ink holds 4.5:1 over a white card up to about here; past it the
 * text would have to flip to white, and white does not reach 4.5:1 until the fill is almost
 * solid. Capping below that band means one text colour works on every cell.
 */
const MAX_FILL = 0.85;

/** How strongly amber paints a date sitting on the middle of the window. */
const MID_FILL = 0.45;

type HeroGridProps = {
  /** The dates the user's window allows, from `safeWindow()`. Order is irrelevant here. */
  window: number[];
  /**
   * The answered date, from `pickAnswer()`, or null while the fund's data is still in flight.
   * The null grid is the same size as the settled one, so the answer arriving moves nothing.
   */
  answer: number | null;
  /** Each date's shading, from `heatForDates()`. Absent until the fund's data arrives. */
  heat?: ReadonlyMap<number, Heat> | undefined;
  /** How far the shading actually runs, in percentage points, for the caption. */
  spanPp?: number | undefined;
  /**
   * Each window date's XIRR against the middle of the window, from `windowEdges()`. Printed
   * under the date. Dates outside the window carry none: they are not choices the reader has.
   */
  edges?: ReadonlyMap<number, number> | undefined;
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

/**
 * The diverging fill: amber underneath, one ramp painted over it. The amber fades out as the
 * ramp fades in, so a date at the far end is pure colour over the white card — the composite the
 * contrast figures were measured on — and a date on the middle of the window is amber alone.
 *
 * Three stops out of nothing but opacity, so the grid still varies on the one channel Phase 6 is
 * allowed to animate. No cell's colour is ever computed or swapped.
 */
function HeatLayers({ heat }: { heat: Heat | undefined }) {
  const ramp = (heat?.intensity ?? 0) * MAX_FILL;
  const amber = heat === undefined ? 0 : MID_FILL * (1 - heat.intensity);

  return (
    <>
      <div className="absolute inset-0 rounded-lg bg-marigold" style={{ opacity: amber }} />
      <div
        className="absolute inset-0 rounded-lg bg-loss"
        style={{ opacity: heat?.tone === "loss" ? ramp : 0 }}
      />
      <div
        className="absolute inset-0 rounded-lg bg-teal"
        style={{ opacity: heat?.tone === "gain" ? ramp : 0 }}
      />
    </>
  );
}

/** The date itself. Ink at every step of the ramp, which is what the fill cap buys. */
function Numeral({ className, date }: { className: string; date: number }) {
  return (
    <span
      className={cn(
        // `leading-none` with flex centring keeps the glyph centred in the cell whichever of
        // Cabinet Grotesk and its metric-matched fallback is painting it.
        "absolute inset-0 flex items-center justify-center font-display text-lg leading-none font-bold tabular text-ink sm:text-2xl",
        className,
      )}
    >
      {date}
    </span>
  );
}

/**
 * The edge under the date. Satoshi with tabular figures, not the Cabinet Grotesk of the numeral:
 * Cabinet has no tabular set (D18), so a column of these would not line up cell to cell.
 */
function Delta({ text }: { text: string }) {
  return (
    <span className="tabular absolute inset-x-0 bottom-1 text-center text-[0.5625rem] leading-none font-medium text-ink sm:text-[0.6875rem]">
      {text}
    </span>
  );
}

/** A legend swatch, painted the same way the cells are so it can't drift from them. */
function Swatch({ className, style }: { className: string; style?: CSSProperties }) {
  return <span className={cn("size-3 shrink-0 rounded-sm", className)} style={style} />;
}

export function HeroGrid({ window: windowDates, answer, heat, spanPp, edges, className }: HeroGridProps) {
  const allowed = new Set(windowDates);

  return (
    <div aria-hidden="true" className={className}>
      <div
        data-hero-grid=""
        // 6 px gaps at 360 px, 8 px from sm up. The cap keeps desktop cells near 64 px rather
        // than letting seven of them stretch to the width of the text column.
        className="grid w-full max-w-[496px] grid-cols-7 gap-1.5 sm:gap-2"
      >
        {DATES.map((date) => {
          const inWindow = allowed.has(date);
          const isAnswer = answer === date;
          // Only the dates the reader could actually choose carry a figure.
          const edge = inWindow ? edges?.get(date) : undefined;

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
              {/* D15: raised on surface is 1.14:1, so an unshaded cell needs a hairline to exist. */}
              <Layer on className="border border-line" />
              <HeatLayers heat={heat?.get(date)} />
              {/* Marigold sits over the shading rather than replacing it, so Phase 6 can fade one
                  over the other instead of swapping a fill. */}
              <Layer on={isAnswer} className="bg-marigold" />
              {/*
               * Dates the reader's salary rules out are washed back, so the window is the vivid
               * region of the grid. An ink outline was tried first and could not be seen at all
               * against a dark teal cell — and a reader drawn to the darkest cell in the grid
               * has to be able to tell it is not one they may use.
               */}
              <div
                className="absolute inset-0 rounded-lg bg-surface"
                style={{ opacity: inWindow ? 0 : 0.62 }}
              />
              <Layer on={isAnswer} className="border-2 border-ink" />
              <Numeral className={edge === undefined ? "" : "pb-2 sm:pb-3"} date={date} />
              {edge === undefined ? null : <Delta text={formatSignedPp(edge)} />}
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute-text">
        <span className="flex items-center gap-1.5">
          <Swatch className="bg-loss" style={{ opacity: MAX_FILL }} />
          <Swatch className="bg-marigold" style={{ opacity: MID_FILL }} />
          <Swatch className="bg-teal" style={{ opacity: MAX_FILL }} />
          Weakest, middle, strongest
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border-2 border-ink bg-marigold" />
          Your date
        </span>
      </p>

      {/*
       * The caption the shading cannot do without. A ramp with no stated span invites the reader
       * to supply their own, and theirs will be far larger than the truth — for most funds the
       * whole picture covers a tenth of a percentage point.
       */}
      {spanPp === undefined ? null : (
        <p className="mt-1 max-w-[65ch] text-xs text-mute-text">
          Deepest red to deepest green across all 28 dates is {formatPp(spanPp)} of XIRR. Dates
          your salary rules out are faded
          {edges === undefined ? "" : ", and each figure is that date’s XIRR against the middle of your window"}.
        </p>
      )}
    </div>
  );
}
