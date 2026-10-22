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
 * out would look like a bug; drawing them smaller and dashed says what is true.
 *
 * The shading is against today's date, which is the other clock read and is resolved in the same
 * effect. The “up” fill means that date's full-history XIRR beat the date the reader is standing on,
 * the “down” fill means it fell short, and today itself is neutral. Each direction is scaled to its
 * own extreme, so the deepest up fill is always the month's best date and the deepest down fill
 * its worst.
 *
 * That scaling is relative to this fund's own range, which is only honest because the caption
 * states the real span and every cell prints its own XIRR — a deep down fill is 20.31% against
 * a baseline of 20.34%, not a loss, and the number is right there.
 *
 * Every fill is a pre-painted overlay whose opacity carries the value, so the reveal has
 * something it is allowed to animate and no cell's colour is ever computed or swapped.
 *
 * The cells size themselves off the grid's own width (`cqi`), not the viewport, so the same
 * markup reads in a phone's full width and in one column of the wide dashboard without a
 * breakpoint for either.
 */
import { useMemo, type CSSProperties } from "react";
import { buildMonth, weekdayLabels, type CalendarMonth } from "../lib/calendar";
import { formatPp, formatRupees, formatXirr, ordinal } from "../lib/format";
import { heatForMonth, type Heat } from "../lib/heat";
import { SCHEDULE, diagonalIndexAt } from "../lib/sequence";
import { ANSWER_SPRING, SPEC_SPRING } from "../lib/spring";
import type { Reveal } from "../lib/use-reveal";
import { cn } from "../lib/utils";
import { useToday } from "../lib/use-today";
import { Animated } from "./animated";

/** Always drawn, so the calendar's height never depends on which month is showing. */
const WEEK_ROWS = 6;

/**
 * The strongest a cell paints. Ink holds 4.5:1 over the card up to about here on both ramps;
 * past it the text would have to flip to the page cream, and that does not reach 4.5:1 until
 * the fill is almost solid. Capping below that band means one text colour works on every cell.
 */
const MAX_FILL = 0.85;

type HeroGridProps = {
  /** The answered date, or null while the fund's data is still in flight. */
  answer: number | null;
  /** Each date's own XIRR, which the cells print and the shading compares. */
  values?: ReadonlyMap<number, number> | undefined;
  /** Final value of the notional SIP, for the hover title. */
  corpora?: ReadonlyMap<number, number> | undefined;
  /** How far the figures actually run, in percentage points, for the caption. */
  spanPp?: number | undefined;
  /** A date the reader is comparing, 1–28. Does not change the named day. */
  selected?: number | null;
  onSelectDay?: ((day: number) => void) | undefined;
  /** The reveal this grid is playing under, or null to render its final state. */
  reveal?: Reveal;
  className?: string;
};

/** A pre-painted ring or fill. `on` picks its opacity and never whether it is rendered. */
function Layer({ on, className }: { on: boolean; className: string }) {
  return (
    <div className={cn("absolute inset-0 rounded-full", className, on ? "opacity-100" : "opacity-0")} />
  );
}

function Swatch({ className, style }: { className: string; style?: CSSProperties | undefined }) {
  return <span className={cn("size-3 shrink-0 rounded-full", className)} style={style} />;
}

type CellProps = {
  day: number;
  /** Where this cell sits in the month grid, which is what orders the wave. */
  row: number;
  column: number;
  sip: boolean;
  isAnswer: boolean;
  isBaseline: boolean;
  isSelected: boolean;
  value: number | undefined;
  corpus: number | undefined;
  namedValue: number | undefined;
  heat: Heat | undefined;
  playing: boolean;
  cellsArrive: boolean;
  generation: number | null;
  onSelect?: ((day: number) => void) | undefined;
};

function Cell({
  day,
  row,
  column,
  sip,
  isAnswer,
  isBaseline,
  isSelected,
  value,
  corpus,
  namedValue,
  heat,
  playing,
  cellsArrive,
  generation,
  onSelect,
}: CellProps) {
  const arrival = {
    play: cellsArrive ? generation : null,
    from: { opacity: 0, transform: "scale(0.96)" },
    spring: SPEC_SPRING,
    delayMs: SCHEDULE.cells!.start + SCHEDULE.cells!.stagger * diagonalIndexAt(row, column),
  };

  // 29–31: a real day of the month that can never be a SIP date. Drawn at 80%, so it reads as
  // a lesser thing before the dashed edge or the greyed numeral is resolved.
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
          className="absolute inset-0 flex scale-80 items-center justify-center rounded-full border-[1.5px] border-dashed border-line"
          {...arrival}
        >
          <span className="font-display text-[clamp(0.75rem,3.5cqi,1.1875rem)] leading-none text-mute-text">
            {day}
          </span>
        </Animated>
      </div>
    );
  }

  const fill = (heat?.intensity ?? 0) * MAX_FILL;
  const gap = value !== undefined && namedValue !== undefined ? value - namedValue : 0;
  const title =
    value === undefined
      ? undefined
      : `${day}: ${formatXirr(value)} XIRR` +
        (corpus === undefined ? "" : `, ${formatRupees(corpus)}`) +
        (isAnswer || namedValue === undefined
          ? ""
          : `, ${formatPp(Math.abs(gap))} ${gap < 0 ? "below" : gap > 0 ? "above" : "from"} the named day`);

  return (
    <div
      data-date={day}
      data-answer={isAnswer ? "" : undefined}
      data-baseline={isBaseline ? "" : undefined}
      data-compare={isSelected ? "" : undefined}
      data-direction={heat?.direction}
      title={title}
      onClick={onSelect ? () => onSelect(day) : undefined}
      className={cn("relative aspect-square", onSelect && "cursor-pointer")}
    >
      <Animated className="absolute inset-0" {...arrival}>
        {/* D15 carried over: the card under an unshaded cell is close in value, so it needs a
            hairline of its own to hold the circle. */}
        <Layer on className="border border-line bg-raised" />

        {/*
         * The colour sweeps in after the cells have landed. One layer, its hue picked by
         * direction and its opacity carrying the distance, so opacity is all that ever animates.
         */}
        <Animated
          className={cn("absolute inset-0 rounded-full", heat?.direction === "down" ? "bg-down" : "bg-up")}
          play={playing ? generation : null}
          from={{ opacity: 0 }}
          to={{ opacity: fill }}
          spring={SPEC_SPRING}
          delayMs={SCHEDULE.fills!.start + SCHEDULE.fills!.stagger * diagonalIndexAt(row, column)}
          style={{ opacity: fill }}
        />

        {/* Today is marked without colour, because neutral here is the absence of a fill and
            would otherwise be indistinguishable from a date whose figure happens to match. */}
        <Layer on={isBaseline && !isAnswer} className="border-2 border-dashed border-mute" />
        <Layer on={isSelected && !isAnswer} className="border-2 border-ink" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="font-display text-[clamp(0.75rem,3.5cqi,1.1875rem)] leading-none text-ink">
            {day}
          </span>
          {value === undefined ? null : (
            <span className="tabular text-[clamp(0.5rem,2.15cqi,0.75rem)] leading-none font-semibold text-ink">
              {formatXirr(value)}
            </span>
          )}
        </div>
      </Animated>

      {/* The answer lands last, on its own spring, and sits outside the cell rather than inside
          it — a ring drawn on the edge would read as one more border among four. */}
      <Animated
        className="pointer-events-none absolute -inset-1 rounded-full border-[3px] border-ink"
        play={playing && isAnswer ? generation : null}
        from={{ opacity: 0, transform: "scale(0.8)" }}
        spring={ANSWER_SPRING}
        delayMs={SCHEDULE.answer!.start}
        style={{ opacity: isAnswer ? 1 : 0 }}
      />
    </div>
  );
}

export function HeroGrid({
  answer,
  values,
  corpora,
  spanPp,
  selected = null,
  onSelectDay,
  reveal = null,
  className,
}: HeroGridProps) {
  const { day: todayDay, months, baseline, ready } = useToday();

  const generation = reveal?.generation ?? null;
  const cellsArrive = reveal?.mode === "first";
  const playing = reveal !== null;

  // Recomputed only when the figures or the baseline move, which is once per fund per day.
  const heat = useMemo(
    () => (values && baseline !== null ? heatForMonth(values, baseline) : null),
    [values, baseline],
  );

  /*
   * This month and no other. The calendar used to step forward three months, which the Organic
   * redraw dropped: every date's figure is a full-history XIRR, identical in every month, so
   * paging only re-dealt the same 28 numbers into different weekday columns.
   */
  const shown: CalendarMonth | null = months[0] ? buildMonth(months[0]) : null;
  const weeks = shown?.weeks ?? [];
  // Always six rows, filled or not, so the height never moves (CLS 0).
  const padded = [...weeks, ...Array.from({ length: Math.max(0, WEEK_ROWS - weeks.length) }, () => [])];

  const shadeNote =
    todayDay === null
      ? null
      : todayDay > 28
        ? `Shaded against the 28th; today, the ${ordinal(todayDay)}, is not a SIP date`
        : `Shaded against today, the ${ordinal(todayDay)}`;

  return (
    <div className={className}>
      <div className="max-w-[32.5rem] 2xl:max-w-none">
        <h3 className="font-display text-[1.375rem]">{shown?.label ?? " "}</h3>
        <p className="mt-0.5 text-[0.8125rem] text-mute-text">{shadeNote ?? " "}</p>
      </div>

      {/*
       * The cell grid duplicates, in colour, what the answer card says in prose, so the whole
       * region stays decorative. Nothing inside it is focusable, which is what lets it be
       * aria-hidden without hiding a control from a keyboard reader.
       */}
      <div aria-hidden="true" data-hero-grid="" className="mt-3.5 max-w-[32.5rem] [container-type:inline-size] 2xl:max-w-none">
        <div className="grid w-full grid-cols-7 gap-[clamp(0.25rem,1.6cqi,0.5625rem)]">
          {weekdayLabels().map((label) => (
            <span key={label} className="pb-0.5 text-center text-[0.6875rem] text-mute-text">
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
                  isBaseline={baseline === slot.day}
                  isSelected={selected === slot.day}
                  value={values?.get(slot.day)}
                  corpus={corpora?.get(slot.day)}
                  namedValue={answer === null ? undefined : values?.get(answer)}
                  heat={heat?.get(slot.day)}
                  playing={playing}
                  cellsArrive={cellsArrive}
                  generation={generation}
                  onSelect={onSelectDay}
                />
              );
            }),
          )}
        </div>
      </div>

      <p className="mt-3.5 flex max-w-[32.5rem] flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-mute-text 2xl:max-w-none">
        <span className="flex items-center gap-1.5">
          <Swatch className="bg-up" style={{ opacity: MAX_FILL }} />
          Higher than today
        </span>
        <span className="flex items-center gap-1.5">
          <Swatch className="bg-down" style={{ opacity: MAX_FILL }} />
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
          <Swatch className="border-[1.5px] border-dashed border-line" />
          Not a SIP date
        </span>
      </p>

      {spanPp === undefined ? null : (
        <p className="mt-2 max-w-[32.5rem] text-xs leading-[1.5] text-mute-text 2xl:max-w-none">
          Each SIP date shows its full-history XIRR. Dates shaded as “higher than today” beat
          today’s date; the other shade fell short. Weakest to strongest across all 28 is{" "}
          {formatPp(spanPp)}, and the deeper the fill, the further from today’s figure that date
          sat. Tap a date (1–28) to compare it with the named day; that does not change the answer.
        </p>
      )}

      {ready ? null : <span className="sr-only">Loading the calendar</span>}
    </div>
  );
}
