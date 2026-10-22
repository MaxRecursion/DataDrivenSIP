/**
 * The landing page: the question (in the shell's header), the field, and the long answer to
 * "should I even care about this?".
 *
 * Everything below the three steps is static prose, and deliberately so. A reader who has not
 * searched a fund yet has no figures to show them, and the honest thing to put in that space
 * is what the tool does, what it refuses to do, and how little the answer is usually worth —
 * the same admissions the fund page makes, before they have picked anything.
 *
 * The thresholds appear here in words (0.25 pp, 0.60). They are the frozen pair from copy.ts,
 * written out because this is prose rather than a computed sentence; if they ever move, this
 * page is on the list of things that move with them.
 */
import { useEffect } from "react";
import { setHead } from "../lib/head";

const STEPS = [
  "Search a fund you already hold.",
  "Read the chip: noise means the day barely matters.",
  "If you SIP on another date, tap it to see the gap.",
];

const QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: "Does the date of the month I run my SIP on actually matter?",
    a:
      "For most funds, barely. Across the funds covered here the gap between the strongest " +
      "and weakest date of the month is usually around a tenth of a percentage point of " +
      "XIRR, which on a corpus built over a decade is a few thousand rupees. This tool still " +
      "names one date, because picking a date and automating it beats deliberating every " +
      "month, and then it says plainly how little the choice was worth.",
  },
  {
    q: "How is the date chosen?",
    a:
      "For each fund, a monthly SIP is simulated on every date from the 1st to the 28th over " +
      "the fund's published NAV history, after the cleaning described below, and each one's " +
      "XIRR is solved by bisection. The date named is simply the one with the highest " +
      "full-history XIRR, with ties going to the earlier date. Nothing is weighted, smoothed " +
      "or tuned.",
  },
  {
    q: "What does a verdict of noise mean?",
    a:
      "That the 28 dates finished close enough together that the difference between them is " +
      "not evidence of a date effect. Two things are tested: whether the strongest and " +
      "weakest dates sit more than 0.25 percentage points of XIRR apart, and whether the " +
      "ordering of dates repeated between the two halves of the fund's history (a split-half " +
      "correlation above 0.60). A fund that passes neither is noise, one that passes one is " +
      "marginal, and only a fund that passes both is meaningful. Noise is a correct answer, " +
      "not a failure to find one, and it is the answer for most funds.",
  },
  {
    q: "Why do the dates stop at the 28th?",
    a:
      "Because February has no 29th in three years out of four. A SIP set for the 30th is not " +
      "a monthly instruction at all — it will be moved or missed several times a year — so " +
      "dates from the 1st to the 28th are the only ones that mean the same thing every month.",
  },
  {
    q: "Does this tell me which mutual fund to invest in?",
    a:
      "No, and it never will. There is no ranking of funds here, in the interface, the copy " +
      "or the data. The question it answers is which date of the month, for one fund you have " +
      "already chosen. It is an educational tool, not investment advice.",
  },
  {
    q: "Where does the data come from?",
    a:
      "AMFI's published NAVs, via mfapi.in, refreshed nightly. Each fund's history is cleaned " +
      "before it is used: single bad prints are dropped, and a series is cut at a " +
      "re-denomination or at a gap longer than 60 days. A fund whose history had to be cut is " +
      "always marked reduced confidence, because a truncated series must not be presented as " +
      "the fund's whole life.",
  },
  {
    q: "Will the answer change over time?",
    a:
      "It can. The figures are recomputed nightly from the full history, so a fund's " +
      "strongest date can move as new NAVs arrive — and on a fund whose verdict is noise, it " +
      "moves more easily, because the dates were never far apart. That instability is itself " +
      "the point: a date that changes when one month is added was never worth rearranging " +
      "your money for.",
  },
];

export function Home() {
  useEffect(() => {
    setHead({
      title: "SIP Date Planner",
      description:
        "Pick a SIP date for your mutual fund, with an honest read on how much the date matters.",
    });
  }, []);

  return (
    <div className="max-w-[65ch]">
      <p className="text-[1.0625rem] leading-[1.55] text-mute-text">
        For most funds the date barely moves the outcome. This shows you what the history says,
        and how much of it is noise.
      </p>

      <ol className="mt-7 flex list-none flex-col gap-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-3.5">
            <span
              aria-hidden="true"
              className="grid size-10 flex-none place-items-center rounded-full bg-raised font-display text-[1.0625rem]"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <h2 className="mt-14 font-display text-[1.75rem]">What this answers</h2>
      <p className="mt-3 text-mute-text">
        One question, for one fund at a time: which day of the month to run your SIP on. For
        every fund covered here, a monthly SIP is simulated on each date from the 1st to the
        28th, across the whole published NAV history, and each one’s XIRR is solved by
        bisection. The date named is the one that came out highest. Nothing is weighted or
        tuned, and no parameter you can set will change it.
      </p>
      <p className="mt-3 text-mute-text">
        The calendar then shades all 28 dates against the one you are reading on, so you can
        see the shape of the difference rather than take a single number on trust. Every cell
        prints its own figure, because a deep terracotta cell is usually 20.31% against 20.34%
        — a real difference, and a tiny one.
      </p>

      <h2 className="mt-11 font-display text-[1.75rem]">Why it usually barely matters</h2>
      <p className="mt-3 text-mute-text">
        Across the funds here, the gap between the strongest and weakest date of the month is
        typically around a tenth of a percentage point of XIRR. On a corpus built over a decade
        that is a few thousand rupees — real money, and far less than most people expect. Where
        the spread is no wider than 0.25 percentage points and the ordering of dates did not
        repeat between the two halves of a fund’s history, the verdict is noise, and the page
        says so instead of dressing the number up.
      </p>
      <p className="mt-3 text-mute-text">
        Missing an instalment costs more than the date does, on almost every fund here. That
        comparison is on each fund’s page, in rupees, because it is the one that changes what a
        reader should actually do: fund the SIP on a day the money is there.
      </p>

      <h2 className="mt-11 font-display text-[1.75rem]">Questions</h2>
      <dl className="mt-4 flex flex-col gap-3">
        {QUESTIONS.map(({ q, a }) => (
          <div key={q} className="rounded-[1.75rem] bg-raised px-[1.375rem] py-5">
            <dt className="font-semibold">{q}</dt>
            <dd className="mt-2 text-mute-text">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
