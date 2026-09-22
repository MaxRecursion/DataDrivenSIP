/**
 * The calendar: a real month, shaded by how each date compares to the one the reader is on.
 *
 * Five things about this markup are load-bearing beyond how it looks.
 *
 * It is a real month, so it is clock-dependent, so it renders only after mount — never in the
 * prerendered HTML, which would bake the build machine's month into every page. Six week rows
 * are always drawn, filled or not, so the height is identical before and after that and CLS
 * stays 0.
 *
 * Dates 29–31 are drawn and inert. SIP dates stop at 28 because February has no 29th in three
 * years out of four, so a SIP set for the 30th is not a monthly instruction at all. Leaving them
 * out would look like a bug; drawing them greyed says what is true.
 *
 * The shading is against today's date, which is the other clock read and is resolved in the same
 * effect. Green means that date's full-history XIRR beat the date the reader is standing on, red
 * means it fell short, and today itself is neutral. Each direction is scaled to its own extreme,
 * so the deepest green is always the month's best date and the deepest red its worst.
 *
 * That scaling is relative to this fund's own range, which is only honest because the caption
 * states the real span and every cell prints its own XIRR — a deep red is 20.31% against a
 * baseline of 20.34%, not a loss, and the number is right there.
 *
 * Every fill is a pre-painted overlay whose opacity carries the value, so the reveal has
 * something it is allowed to animate and no cell's colour is ever computed or swapped.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  baselineDate,
  buildMonth,
  monthOf,
  monthsAhead,
  weekdayLabels,
  type CalendarMonth,
  type MonthKey,
} from "../lib/calendar";
import { formatPp, formatXirr } from "../lib/format";
import { heatForMonth, type Heat } from "../lib/heat";
import { SCHEDULE, diagonalIndexAt } from "../lib/sequence";
import { ANSWER_SPRING, SPEC_SPRING } from "../lib/spring";
import type { Reveal } from "../lib/use-reveal";
import { cn } from "../lib/utils";
import { Animated } from "./animated";

/** Always drawn, so the calendar's height never depends on which month is showing. */
const WEEK_ROWS = 6;

/**
 * The strongest a cell paints. Ink holds 4.5:1 over a white card up to about here on both
 * ramps; past it the text would have to flip to white, and white does not reach 4.5:1 until the
 * fill is almost solid. Capping below that band means one text colour works on every cell.
 */
const MAX_FILL = 0.85;

type HeroGridProps = {
  /** The answered date, or null while the fund's data is still in flight. */
  answer: number | null;
  /** Each date's own XIRR, which the cells print and the shading compares. */
  values?: ReadonlyMap<number, number> | undefined;
  /** How far the figures actually run, in percentage points, for the caption. */
  spanPp?: number | undefined;
  /** The reveal this grid is playing under, or null to render its final state. */
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
 * What the clock decides: the month on screen and the date the shading compares against. Both
 * are null until after mount, because reading a clock during render would put the build
 * machine's September into 994 prerendered pages.
 */
function useToday(): { months: MonthKey[]; baseline: number | null; ready: boolean } {
  const [today, setToday] = useState<{ month: MonthKey; baseline: number } | null>(null);
  useEffect(() => {
    const now = new Date();
    setToday({ month: monthOf(now), baseline: baselineDate(now) });
  }, []);
  return {
    months: today ? monthsAhead(today.month) : [],
    baseline: today?.baseline ?? null,
    ready: today !== null,
  };
}

type CellProps = {
  day: number;
  /** Where this cell sits in the month grid, which is what orders the wave. */
  row: number;
  column: number;
  sip: boolean;
  isAnswer: boolean;
  isBaseline: boolean;
  value: number | undefined;
  heat: Heat | undefined;
  playing: boolean;
  cellsArrive: boolean;
  generation: number | null;
};

function Cell({
  day,
  row,
  column,
  sip,
  isAnswer,
  isBaseline,
  value,
  heat,
  playing,
  cellsArrive,
  generation,
}: CellProps) {
  const arrival = {
    play: cellsArrive ? generation : null,
    from: { opacity: 0, transform: "scale(0.96)" },
    spring: SPEC_SPRING,
    delayMs: SCHEDULE.cells!.start + SCHEDULE.cells!.stagger * diagonalIndexAt(row, column),
  };

  // 29–31: a real day of the month that can never be a SIP date.
  if (!sip) {
    return (
      <div
        data-date={day}
        data-unavailable=""
        className="relative aspect-square"
        title="SIP dates run from the 1st to the 28th, so every month has one"
      >
        {/* Arrives on its own diagonal like every other cell. Left out of the sequence it was
            the only thing on screen at 0 ms, which read as the grid failing to load. */}
        <Animated
          className="absolute inset-0 flex items-center justify-center rounded-lg border border-line bg-raised"
          {...arrival}
        >
          <span className="font-display text-sm leading-none font-bold text-mute sm:text-lg">{day}</span>
        </Animated>
      </div>
    );
  }

  const fill = (heat?.intensity ?? 0) * MAX_FILL;

  return (
    <div
      data-date={day}
      data-answer={isAnswer ? "" : undefined}
      data-baseline={isBaseline ? "" : undefined}
      data-direction={heat?.direction}
      className="relative aspect-square rounded-lg bg-raised"
    >
      <Animated className="absolute inset-0" {...arrival}>
        {/* D15: raised on surface is 1.14:1, so an unshaded cell needs a hairline. */}
        <Layer on className="border border-line" />

        {/*
         * The colour sweeps in after the cells have landed, on the schedule step that used to
         * carry the salary window's wave before that concept was removed. One layer, its hue
         * picked by direction and its opacity
         * carrying the distance, so opacity is all that ever animates.
         */}
        <Animated
          className={cn(
            "absolute inset-0 rounded-lg",
            heat?.direction === "down" ? "bg-loss" : "bg-teal",
          )}
          play={playing ? generation : null}
          from={{ opacity: 0 }}
          to={{ opacity: fill }}
          spring={SPEC_SPRING}
          delayMs={SCHEDULE.fills!.start + SCHEDULE.fills!.stagger * diagonalIndexAt(row, column)}
          style={{ opacity: fill }}
        />

        {/* The answer lands last, on its own spring. A thick ink ring rather than a fill, so
            whatever the cell is shaded stays readable underneath it. */}
        <Animated
          className="absolute inset-0 rounded-lg border-[3px] border-ink"
          play={playing && isAnswer ? generation : null}
          from={{ opacity: 0, transform: "scale(0.8)" }}
          spring={ANSWER_SPRING}
          delayMs={SCHEDULE.answer!.start}
          style={{ opacity: isAnswer ? 1 : 0 }}
        />

        {/* Today is marked without colour, because neutral here is the absence of a fill and
            would otherwise be indistinguishable from a date whose figure happens to match. */}
        <Layer on={isBaseline && !isAnswer} className="border-2 border-dashed border-mute" />

        <span className="absolute inset-x-0 top-1.5 text-center font-display text-sm leading-none font-bold text-ink sm:top-2 sm:text-lg 2xl:top-[12%] 2xl:text-[clamp(1.125rem,1.1vw,1.75rem)]">
          {day}
        </span>
        {value === undefined ? null : (
          <span className="tabular absolute inset-x-0 bottom-1 text-center text-[0.5625rem] leading-none font-medium text-ink sm:bottom-1.5 sm:text-xs 2xl:bottom-[12%] 2xl:text-[clamp(0.75rem,0.6vw,1rem)]">
            {formatXirr(value)}
          </span>
        )}
      </Animated>
    </div>
  );
}

export function HeroGrid({ answer, values, spanPp, reveal = null, className }: HeroGridProps) {
  const { months, baseline, ready } = useToday();
  const [offset, setOffset] = useState(0);
  const [navigated, setNavigated] = useState(false);

  const generation = reveal?.generation ?? null;

  /**
   * A new fund re-arms the reveal and puts the calendar back on the current month; until then,
   * navigating months switches the entrance off.
   *
   * `Animated` re-runs whenever its delay changes, and changing month changes which date sits in
   * a given slot and so what that slot's stagger is. Without this, every press of the month
   * arrows replayed the whole entrance — `useReveal` never clears itself back to null, so it
   * replayed for the life of the page, not merely during the first 700 ms.
   */
  const [armedFor, setArmedFor] = useState(generation);
  if (generation !== armedFor) {
    setArmedFor(generation);
    setNavigated(false);
    setOffset(0);
  }

  const cellsArrive = reveal?.mode === "first" && !navigated;
  const playing = reveal !== null && !navigated;

  // Recomputed only when the figures or the baseline move, which is once per fund per day.
  const heat = useMemo(
    () => (values && baseline !== null ? heatForMonth(values, baseline) : null),
    [values, baseline],
  );

  const shown: CalendarMonth | null = months[offset] ? buildMonth(months[offset]) : null;
  const weeks = shown?.weeks ?? [];
  // Always six rows, filled or not, so the height never moves (CLS 0).
  const padded = [...weeks, ...Array.from({ length: Math.max(0, WEEK_ROWS - weeks.length) }, () => [])];
  // Only this month contains today; the months ahead are entirely in the future.
  const baselineHere = offset === 0 ? baseline : null;

  return (
    <div className={className}>
      {/*
       * The controls sit outside the hidden region. The cell grid duplicates, in colour, what the
       * answer block says in prose, so it stays decorative — but a focusable button inside
       * `aria-hidden` is invalid ARIA, and `‹` alone is not a name.
       */}
      <div className="mb-2 flex w-full max-w-[496px] items-center justify-between gap-2 2xl:max-w-none">
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
        <div className="grid w-full max-w-[496px] grid-cols-7 gap-1 sm:gap-2 2xl:max-w-none">
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
                  row={row}
                  column={column}
                  sip={slot.sip}
                  isAnswer={answer === slot.day}
                  isBaseline={baselineHere === slot.day}
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
          <Swatch className="bg-teal" style={{ opacity: MAX_FILL }} />
          Higher than today
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="bg-loss" style={{ opacity: MAX_FILL }} />
          Lower than today
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border-2 border-dashed border-mute" />
          Today
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border-[3px] border-ink" />
          Best day
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="border border-line bg-raised" />
          Not a SIP date
        </span>
      </p>

      {spanPp === undefined ? null : (
        <p className="mt-1 max-w-[65ch] text-xs text-mute-text">
          Each SIP date shows its full-history XIRR. Green dates were higher than today’s date;
          red dates were lower. Weakest to strongest across all 28 is {formatPp(spanPp)}, and the
          deeper the fill, the further from today’s figure that date sat.
        </p>
      )}

      {ready ? null : <span className="sr-only">Loading the calendar</span>}
    </div>
  );
}
