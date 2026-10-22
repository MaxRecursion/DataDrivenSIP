/**
 * The answer, as one card (Tithi Prototype.dc.html): the date at display size, the verdict
 * beside it, the sentence that qualifies it, and the three figures that justify it.
 *
 * The three tiles are the point of the redraw. The page has always named a date and then
 * spent four sections explaining how little it was worth; "Why the 26th" puts the return, the
 * spread and the rupee value of that spread side by side, where the third deflates the first
 * two in the same glance. Their strings come from reasons.ts — this file decides where they
 * sit and nothing else, so there is still no number derived twice.
 *
 * Static by construction, apart from the one rupee figure that counts up. Nothing transitions:
 * the heading is plain text at full opacity and stays that way, because it is the one thing a
 * reader came for. The orchestrated reveal animates the calendar around this card, never the
 * card's own text.
 */
import type { Verdict } from "../../shared/artifacts";
import { verdictLabel } from "../lib/compare";
import type { AnswerCopy } from "../lib/copy";
import { formatRupees, ordinal } from "../lib/format";
import type { Reason } from "../lib/reasons";
import { SCHEDULE, TICKER_MS } from "../lib/sequence";
import type { Reveal } from "../lib/use-reveal";
import { cn } from "../lib/utils";
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
 * Organic reserves colour for direction and verdict alike, on the 100/800 steps of each ramp:
 * light enough to sit on the card, dark enough for the label to pass AA on it.
 */
const TAG: Record<Verdict, string> = {
  noise: "bg-neutral-100 text-neutral-800",
  marginal: "bg-down-100 text-down-800",
  meaningful: "bg-up-100 text-up-800",
};

/**
 * Programmatic focus draws no ring in most browsers, which is what we want after a selection —
 * but a keyboard reader who shift-tabs back to the heading should still see where they are, so
 * the outline stays on focus-visible rather than being removed outright.
 *
 * 16cqi, not vw: the card is a container, so the date scales with the column it is in rather
 * than the window. That is what lets the same markup read at 112px in one reading column and
 * at 52px in the wide dashboard's first column without a breakpoint for each.
 */
const HEADING_CLASS =
  "font-display text-[clamp(3.25rem,16cqi,7rem)] leading-none tracking-[-0.02em] text-ink" +
  " focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus";

type AnswerBlockProps = {
  copy: AnswerCopy;
  /** The date the page answers with, 1-28. Rendered as the heading, e.g. "The 12th". */
  answerDate: number;
  verdict: Verdict;
  /** The three "why this date" tiles, already written (reasons.ts). */
  reasons: Reason[];
  /** The reveal in flight, or null to render the final figure at once (§8.3, D10c). */
  reveal?: Reveal;
  /** The copy-the-answer control, placed by the caller: in this card, or in the calendar's. */
  copyControl?: React.ReactNode;
};

export function AnswerBlock({
  copy,
  answerDate,
  verdict,
  reasons,
  reveal = null,
  copyControl,
}: AnswerBlockProps) {
  return (
    <section className="flex flex-col gap-4 rounded-[2.25rem] bg-raised p-5 [container-type:inline-size] md:gap-5 md:p-8 2xl:gap-2.5 2xl:p-[1.375rem]">
      {/*
       * The screen-reader substitute for the calendar, which is aria-hidden. role="status"
       * carries an implicit polite, atomic live region, so the whole sentence is re-read rather
       * than the diff when a reader moves from one fund to another. Content present at load
       * isn't announced, so a cold page stays quiet.
       */}
      <p role="status" className="sr-only">
        {copy.srSummary}
      </p>

      <div>
        <p className="text-sm font-semibold text-mute-text">Best SIP day for this fund</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <h2 id={ANSWER_HEADING_ID} tabIndex={-1} className={HEADING_CLASS}>
            The {ordinal(answerDate)}
          </h2>
          <span
            data-verdict={verdict}
            className={cn(
              "inline-flex items-center rounded-full px-4 py-[0.4375rem] text-[0.9375rem] leading-none font-semibold",
              TAG[verdict],
            )}
          >
            {verdictLabel(verdict)}
          </span>
        </div>
      </div>

      {/*
       * Every line here is a function of the fund alone, so the prerendered HTML and the client
       * render are identical and nothing swaps under the reader (D13: CLS 0).
       *
       * Marked so the e2e suite can find the qualifying sentence apart from the heading.
       */}
      <p data-answer-copy className="max-w-[60ch] leading-[1.5] text-pretty md:text-[1.0625rem] 2xl:text-[0.90625rem]">
        {copy.headline}
      </p>

      <div>
        <h3 className="font-display text-[1.1875rem]">Why the {ordinal(answerDate)}</h3>
        {/*
         * Three across in a reading column, stacked everywhere else. On the wide dashboard the
         * tiles stack again, because the card is one of four columns rather than the full width.
         */}
        <ol className="mt-2.5 grid list-none grid-cols-1 gap-2.5 md:grid-cols-3 2xl:grid-cols-1">
          {reasons.map((reason) => (
            <li
              key={reason.n}
              className="flex items-start gap-3 rounded-[1.5rem] bg-neutral-100 p-3.5 md:p-4 2xl:px-3 2xl:py-2"
            >
              <span
                aria-hidden="true"
                className="grid size-[1.875rem] flex-none place-items-center rounded-full bg-ink font-display text-sm text-surface"
              >
                {reason.n}
              </span>
              <div className="min-w-0">
                <div className="text-[0.8125rem] leading-[1.3] font-semibold text-mute-text">{reason.title}</div>
                <div className="tabular mt-1 font-display text-2xl leading-[1.05] md:text-[1.625rem] 2xl:text-xl">
                  {reason.ticker ? (
                    <RupeeTicker
                      value={reason.ticker.value}
                      format={formatRupees}
                      reveal={reveal?.generation ?? null}
                      delayMs={SCHEDULE.ticker!.start}
                      durationMs={TICKER_MS}
                    />
                  ) : (
                    reason.figure
                  )}
                </div>
                <p className="mt-1.5 text-[0.8125rem] leading-[1.45] text-pretty text-mute-text 2xl:text-xs">
                  {reason.sub}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* The one line of "What actually matters" that belongs above the fold. */}
      <div className="flex items-start gap-2.5 rounded-[1.5rem] bg-[color-mix(in_srgb,var(--up)_24%,transparent)] px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 flex-none"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <p className="text-sm leading-[1.5]">{copy.mattersGlance}</p>
      </div>

      {/* On the wide dashboard the caveats get a card of their own, so they are hidden here. */}
      {copy.caveats.length > 0 ? (
        <div className="flex flex-col gap-2 2xl:hidden">
          {copy.caveats.map((caveat) => (
            <p key={caveat} className="text-[0.8125rem] leading-[1.5] text-mute-text">
              {caveat}
            </p>
          ))}
        </div>
      ) : null}

      {copyControl ? <div>{copyControl}</div> : null}
    </section>
  );
}
