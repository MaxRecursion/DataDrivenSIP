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
import type { AnswerCopy } from "../lib/copy";
import { ordinal } from "../lib/format";

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
};

export function AnswerBlock({ copy, answerDate }: AnswerBlockProps) {
  return (
    <section className="mt-6 max-w-[65ch]">
      {/*
       * The one polite live region on the page, and the screen-reader substitute for the grid,
       * which is aria-hidden. They are deliberately the same element: this sentence already says
       * what a salary or buffer change did ("Your window: 3rd to 12th. Your date: the 12th."),
       * so a second region would read the same fact twice. role="status" carries an implicit
       * polite, atomic live region, so the whole sentence is re-read rather than the diff.
       *
       * The announcement reaches here from window-controls.tsx the long way round, through the
       * URL and a new pick, which is also the only way the visible answer changes. Content
       * present at load isn't announced, so a cold page stays quiet.
       */}
      <p role="status" className="sr-only">
        {copy.srSummary}
      </p>

      {/* Plain text, full opacity, never animated (PLAN.md §6.4). One line at every width, so
          its height is fixed and nothing below it moves when the date changes. */}
      <h2
        id={ANSWER_HEADING_ID}
        tabIndex={-1}
        className={HEADING_CLASS}
      >
        The {ordinal(answerDate)}
      </h2>

      {/*
       * The headline is the only line whose length depends on the window: the caveats and the
       * rupee line are functions of the fund alone, so they render identically in the prerendered
       * HTML and in the client render that follows a non-default ?salary=. Reserving four lines
       * at 360 px and three from 640 px up covers every branch of the D7 table, which keeps the
       * swap free of layout shift (PLAN.md §6.2, D13: CLS 0). It is a floor, not a cap.
       *
       * The floors are multiples of the line-height this paragraph actually uses: leading-relaxed
       * is 1.625, so a line is 1.625rem, and four lines are 6.5rem — not the 6.1rem a 1.5
       * line-height would give, which fell about six pixels short of the four-line case and let
       * it push the rupee line, the controls and the footer down.
       */}
      <p className="mt-4 min-h-[6.5rem] leading-relaxed text-ink sm:min-h-[4.875rem]">{copy.headline}</p>

      {copy.caveats.map((caveat) => (
        <p key={caveat} className="mt-3 text-sm leading-relaxed text-mute-text">
          {caveat}
        </p>
      ))}

      {/* An explicit line-height, because ₹ is borrowed from Cabinet Grotesk by unicode-range and
          a taller glyph would otherwise set this line's box on its own (PLAN.md §7, D14). */}
      <p className="mt-4 text-sm leading-[1.7] text-mute-text">{copy.rupeeLine}</p>
    </section>
  );
}
