/**
 * The calendar (PLAN.md §7, extended): a real month, shaded by what each date returned.
 *
 * Five things about this markup are load-bearing beyond how it looks.
 *
 * It is a real month, so it is clock-dependent, so it renders only after mount — never in the
 * prerendered HTML, which would bake the build machine's month into every page (CLAUDE.md). Six
 * week rows are always drawn, filled or not, so the height is identical before and after that
 * and CLS stays 0.
 *
 * Dates 29–31 are drawn and inert. SIP dates stop at 28 because February has no 29th in three
 * years out of four, so a SIP set for the 30th is not a monthly instruction at all. Leaving them
 * out would look like a bug; drawing them greyed says what is true.
 *
 * One green ramp, deepest for the strongest date of the month. It is relative to this fund's own
 * range, so a fund whose dates span four hundredths of a point still fills it end to end — which
 * is only honest because the caption states the real span and every cell prints its own XIRR.
 *
 * The ten dates the salary allows stay brighter than the rest, because the answer can only ever
 * come from those, and a reader drawn to the deepest cell has to be able to see when it is not
 * one they may use.
 *
 * Every fill is a pre-painted overlay whose opacity carries the value, so the reveal has
 * something it is allowed to animate and no cell's colour is ever computed or swapped.
 */
import { useEffect, useState, type CSSProperties } from "react";
import {
  buildMonth,
  monthOf,
  monthsAhead,
  weekdayLabels,
  type CalendarMonth,
  type MonthKey,
} from "../lib/calendar";
import { formatPp, formatXirr } from "../lib/format";
import type { Heat } from "../lib/heat";
import { SCHEDULE, diagonalIndexOf } from "../lib/sequence";
import { ANSWER_SPRING, SPEC_SPRING } from "../lib/spring";
import type { Reveal } from "../lib/use-reveal";
import { cn } from "../lib/utils";
import { Animated } from "./animated";

/** Always drawn, so the calendar's height never depends on which month is showing. */
const WEEK_ROWS = 6;

/**
 * The strongest a cell paints. Ink holds 4.5:1 over a white card up to about here; past it the
 * text would have to flip to white, and white does not reach 4.5:1 until the fill is almost
 * solid. Capping below that band means one text colour works on every cell.
 */
const MAX_FILL = 0.85;

/**
 * How far back a date the salary rules out is washed.
 *
 * A gentle recede, and deliberately not the signal. Brightness already carries XIRR across all 28
 * dates, and it cannot carry the window too: on Mahindra Manulife the deepest cell of the month
 * is the 22nd, which is outside a last-working-day window, while the ten dates that window does
 * allow are the palest in the grid. Washing harder only made that read as "these ten are worse".
 * The window is an outline instead — orthogonal to the ramp, so neither can lie about the other.
 */
const OUT_OF_WINDOW_FADE = 0.25;

type HeroGridProps = {
  /** The dates the user's window allows, from `safeWindow()`. */
  window: number[];
  /** The answered date, or null while the fund's data is still in flight. */
  answer: number | null;
  /** Each date's own XIRR, which the cells print and the shading ranks. */
  values?: ReadonlyMap<number, number> | undefined;
  /** Each date's shading, from `heatForMonth()`. */
  heat?: ReadonlyMap<number, Heat> | undefined;
  /** How far the shading actually runs, in percentage points, for the caption. */
  spanPp?: number | undefined;
  /** The reveal this grid is playing under, or null to render its final state (D10c, §8.3). */
  reveal?: Reveal;
  className?: string;
};

/** A pre-painted fill. `on` picks its opacity and never whether it is rendered. */
function Layer({ on, className }: { on: boolean; className: string }) {
  return (
    <div className={cn("absolute inset-0 rounded-lg", className, on ? "opacity-100" : "opacity-0")} />
  );
}

function Swatch({ className, style }: { className: string; style?: CSSProperties | undefined }) {
  return <span className={cn("size-3 shrink-0 rounded-sm", className)} style={style} />;
}

/**
 * The month the reader is looking at, resolved after mount. Null until then: reading a clock
 * during render would put the build machine's month into 994 prerendered pages.
 */
function useVisibleMonths(): { months: MonthKey[]; ready: boolean } {
  const [today, setToday] = useState<MonthKey | null>(null);
  useEffect(() => setToday(monthOf(new Date())), []);
  return { months: today ? monthsAhead(today) : [], ready: today !== null };
}

type CellProps = {
  day: number;
  sip: boolean;
  inWindow: boolean;
  isAnswer: boolean;
  value: number | undefined;
  heat: Heat | undefined;
  playing: boolean;
  cellsArrive: boolean;
  generation: number | null;
};

function Cell({ day, sip, inWindow, isAnswer, value, heat, playing, cellsArrive, generation }: CellProps) {
  // 29–31: a real day of the month that can never be a SIP date.
  if (!sip) {
    return (
      <div
        data-date={day}
        data-unavailable=""
        className="relative flex aspect-square items-center justify-center rounded-lg border border-line bg-raised"
        title="SIP dates run from the 1st to the 28th, so every month has one"
      >
        <span className="font-display text-sm leading-none font-bold text-mute sm:text-lg">{day}</span>
      </div>
    );
  }

  return (
    <div
      data-date={day}
      data-in-window={inWindow ? "" : undefined}
      data-answer={isAnswer ? "" : undefined}
      className="relative aspect-square rounded-lg bg-raised"
    >
      <Animated
        className="absolute inset-0"
        play={cellsArrive ? generation : null}
        from={{ opacity: 0, transform: "scale(0.96)" }}
        spring={SPEC_SPRING}
        delayMs={SCHEDULE.cells!.start + SCHEDULE.cells!.stagger * diagonalIndexOf(day)}
      >
        {/* D15: raised on surface is 1.14:1, so an unshaded cell needs a hairline. The window's
            outline replaces it rather than doubling it. */}
        <Layer on={!inWindow} className="border border-line" />
        <Layer on={inWindow} className="border-2 border-ink/25" />
        <div
          className="absolute inset-0 rounded-lg bg-teal transition-opacity duration-200 motion-reduce:transition-none"
          style={{ opacity: (heat?.intensity ?? 0) * MAX_FILL }}
        />
        <div
          className="absolute inset-0 rounded-lg bg-surface transition-opacity duration-200 motion-reduce:transition-none"
          style={{ opacity: inWindow ? 0 : OUT_OF_WINDOW_FADE }}
        />
        {/* §8.2: the answer lands last, on its own spring (D10b). A thick ink ring rather than a
            second fill, so the ramp underneath stays readable. */}
        <Animated
          className="absolute inset-0 rounded-lg border-[3px] border-ink"
          play={playing && isAnswer ? generation : null}
          from={{ opacity: 0, transform: "scale(0.8)" }}
          spring={ANSWER_SPRING}
          delayMs={SCHEDULE.answer!.start}
          style={{ opacity: isAnswer ? 1 : 0 }}
        />

        <span className="absolute inset-x-0 top-1.5 text-center font-display text-sm leading-none font-bold text-ink sm:top-2 sm:text-lg">
          {day}
        </span>
        {value === undefined ? null : (
          <span className="tabular absolute inset-x-0 bottom-1 text-center text-[0.5625rem] leading-none font-medium text-ink sm:bottom-1.5 sm:text-xs">
            {formatXirr(value)}
          </span>
        )}
      </Animated>
    </div>
  );
}

export function HeroGrid({
  window: windowDates,
  answer,
  values,
  heat,
  spanPp,
  reveal = null,
  className,
}: HeroGridProps) {
  const { months, ready } = useVisibleMonths();
  const [offset, setOffset] = useState(0);
  const [navigated, setNavigated] = useState(false);

  const allowed = new Set(windowDates);
  const cellsArrive = reveal?.mode === "first";
  const playing = reveal !== null;
  const generation = reveal?.generation ?? null;

  const shown: CalendarMonth | null = months[offset] ? buildMonth(months[offset]) : null;
  const weeks = shown?.weeks ?? [];
  // Always six rows, filled or not, so the height never moves (CLS 0).
  const padded = [...weeks, ...Array.from({ length: Math.max(0, WEEK_ROWS - weeks.length) }, () => [])];

  return (
    <div className={className}>
      {/*
       * The controls sit outside the hidden region. The cell grid duplicates, in colour, what the
       * answer block says in prose, so it stays decorative — but a focusable button inside
       * `aria-hidden` is invalid ARIA, and `‹` alone is not a name.
       */}
      <div className="mb-2 flex w-full max-w-[496px] items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setNavigated(true);
            setOffset((current) => Math.max(0, current - 1));
          }}
          disabled={offset === 0}
          aria-label="Previous month"
          className="rounded-lg px-2 py-1 text-sm text-mute-text transition-transform duration-100 active:scale-95 disabled:opacity-40 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          <span aria-hidden="true">‹</span>
        </button>
        {/* Polite, so a keyboard user hears which month the presses landed on — but not on
            mount, where the label's first appearance would announce a month nobody asked for. */}
        <span aria-live={navigated ? "polite" : "off"} className="font-display text-sm font-bold text-ink">
          {shown?.label ?? " "}
        </span>
        <button
          type="button"
          onClick={() => {
            setNavigated(true);
            setOffset((current) => Math.min(months.length - 1, current + 1));
          }}
          disabled={offset >= months.length - 1}
          aria-label="Next month"
          className="rounded-lg px-2 py-1 text-sm text-mute-text transition-transform duration-100 active:scale-95 disabled:opacity-40 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div aria-hidden="true" data-hero-grid="">
        <div className="grid w-full max-w-[496px] grid-cols-7 gap-1 sm:gap-2">
          {weekdayLabels().map((label) => (
            <span key={label} className="pb-1 text-center text-[0.625rem] text-mute-text">
              {label}
            </span>
          ))}

          {padded.flatMap((week, row) =>
            Array.from({ length: 7 }, (_, column) => {
              const slot = week[column];
              const key = `${row}-${column}`;
              if (!slot || slot.day === null) return <div key={key} className="aspect-square" />;
              return (
                <Cell
                  key={key}
                  day={slot.day}
                  sip={slot.sip}
                  inWindow={allowed.has(slot.day)}
                  isAnswer={answer === slot.day}
                  value={values?.get(slot.day)}
                  heat={heat?.get(slot.day)}
                  playing={playing}
                  cellsArrive={cellsArrive}
                  generation={generation}
                />
              );
            }),
          )}
        </div>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute-text">
        <span className="flex items-center gap-1.5">
          <Swatch className="bg-teal" style={{ opacity: 0.12 * MAX_FILL }} />
          <Swatch className="bg-teal" style={{ opacity: MAX_FILL }} />
          Weakest to strongest
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border-2 border-ink/25" />
          Your window
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border-[3px] border-ink" />
          Your date
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border border-line bg-raised" />
          Not a SIP date
        </span>
      </p>

      {spanPp === undefined ? null : (
        <p className="mt-1 max-w-[65ch] text-xs text-mute-text">
          Each figure is that date’s XIRR, and palest to deepest across all 28 dates is{" "}
          {formatPp(spanPp)}. The ten your salary allows are outlined, and the date named below is
          only ever one of those — chosen on how it ranked over rolling 3-year stretches, which is
          not always the date with the deepest fill here.
        </p>
      )}

      {ready ? null : <span className="sr-only">Loading the calendar</span>}
    </div>
  );
}
