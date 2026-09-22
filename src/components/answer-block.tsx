/**
 * The answer in words (PLAN.md §6.4, §6.6, §7): the date, the sentence that qualifies it, the
 * caveats that apply to this fund, and the rupee framing.
 *
 * Static by construction. Nothing here imports motion, and nothing transitions: the heading is
 * plain text at full opacity and stays that way, because it is the one thing on the page a
 * reader came for. The orchestrated reveal in Phase 6 animates the grid around this block, never
 * the block's own text.
 *
 * Every string arrives already written and already formatted (copy.ts, format.ts). This file
 * decides where the sentences sit and how much room they get, and nothing else — there is no
 * number to derive here, so there is nothing to get wrong twice.
 */
import type { Verdict } from "../../shared/artifacts";
import { verdictLabel } from "../lib/compare";
import type { AnswerCopy } from "../lib/copy";
import { formatRupees, ordinal } from "../lib/format";
import { SCHEDULE, TICKER_MS } from "../lib/sequence";
import type { Reveal } from "../lib/use-reveal";
import { RupeeTicker } from "./rupee-ticker";

/**
 * The fund page moves focus here after a fund is chosen (PLAN.md §6.6), so the reader lands on
 * the answer rather than at the top of a page that changed under them:
 *
 *   document.getElementById(ANSWER_HEADING_ID)?.focus()
 *
 * An id rather than a forwarded ref: the caller is a route that re-renders for reasons unrelated
 * to this block, and a ref would make it hold a mutable handle it doesn't otherwise need. Only
 * one answer is ever on the page, so a fixed id can't collide.
 */
export const ANSWER_HEADING_ID = "answer-heading";

/**
 * Programmatic focus draws no ring in most browsers, which is what we want after a selection —
 * but a keyboard reader who shift-tabs back to the heading should still see where they are, so
 * the outline stays on focus-visible rather than being removed outright.
 */
const HEADING_CLASS =
  "font-display text-4xl leading-[1.15] font-bold text-ink sm:text-5xl" +
  " focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal";

type AnswerBlockProps = {
  copy: AnswerCopy;
  /** The date the page answers with, 1-28. Rendered as the heading, e.g. "The 12th". */
  answerDate: number;
  verdict: Verdict;
  /** A tapped or stored SIP date compared with the named day. */
  compareText?: string | undefined;
  /** The reveal in flight, or null to render the final figure at once (§8.3, D10c). */
  reveal?: Reveal;
};

export function AnswerBlock({ copy, answerDate, verdict, compareText, reveal = null }: AnswerBlockProps) {
  return (
    <section className="mt-6 max-w-[65ch]">
      {/*
       * The screen-reader substitute for the grid, which is aria-hidden. role="status" carries
       * an implicit polite, atomic live region, so the whole sentence is re-read rather than the
       * diff when a reader moves from one fund to another. Content present at load isn't
       * announced, so a cold page stays quiet.
       */}
      <p role="status" className="sr-only">
        {copy.srSummary}
      </p>

      {/* Plain text, full opacity, never animated (PLAN.md §6.4). One line at every width, so
          its height is fixed and nothing below it moves when the date changes. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2
          id={ANSWER_HEADING_ID}
          tabIndex={-1}
          className={HEADING_CLASS}
        >
          The {ordinal(answerDate)}
        </h2>
        <span
          data-verdict={verdict}
          className="rounded-full border border-line px-2.5 py-0.5 text-sm leading-none text-mute-text"
        >
          {verdictLabel(verdict)}
        </span>
      </div>

      {/*
       * Every line here is a function of the fund alone, so the prerendered HTML and the client
       * render are identical and nothing swaps under the reader. Reserving four lines at 360 px
       * and three from 640 px up covers every branch of the headline table, which keeps the
       * page free of layout shift (D13: CLS 0). It is a floor, not a cap.
       *
       * The floors are multiples of the line-height this paragraph actually uses: leading-relaxed
       * is 1.625, so a line is 1.625rem, and four lines are 6.5rem — not the 6.1rem a 1.5
       * line-height would give, which fell about six pixels short of the four-line case and let
       * it push the rupee line, the controls and the footer down.
       */}
      {/* Marked so the e2e suite can find the qualifying sentence apart from the heading. */}
      <p data-answer-copy className="mt-4 min-h-[6.5rem] leading-relaxed text-ink sm:min-h-[4.875rem] 2xl:min-h-0">
        {copy.headline}
      </p>

      {compareText ? (
        <p data-compare-copy className="mt-3 text-sm leading-relaxed text-ink">
          {compareText}
        </p>
      ) : null}

      <p className="mt-3 text-sm leading-relaxed text-mute-text 2xl:hidden">{copy.mattersGlance}</p>

      {copy.caveats.map((caveat) => (
        <p key={caveat} className="mt-3 text-sm leading-relaxed text-mute-text 2xl:mt-2">
          {caveat}
        </p>
      ))}

      {/* An explicit line-height, because ₹ is borrowed from Cabinet Grotesk by unicode-range and
          a taller glyph would otherwise set this line's box on its own (PLAN.md §7, D14). */}
      <p className="mt-4 text-sm leading-[1.7] text-mute-text">
        {copy.rupeeBefore}
        <RupeeTicker
          value={copy.rupeeGap}
          format={formatRupees}
          reveal={reveal?.generation ?? null}
          delayMs={SCHEDULE.ticker!.start}
          durationMs={TICKER_MS}
        />
        {copy.rupeeAfter}
      </p>
      {copy.xirrExtremes ? (
        <p className="mt-3 text-sm leading-relaxed text-mute-text 2xl:hidden">{copy.xirrExtremes}</p>
      ) : null}
    </section>
  );
}
