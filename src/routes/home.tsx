/**
 * The landing page: the question, the field, and enough of an answer to be worth reading on its
 * own.
 *
 * It used to be three bullets. That was right when the only way here was a shared link, and wrong
 * once this became the page a search engine judges the site by: a page with forty words on it has
 * nothing to rank, and nothing to tell someone who arrived on a question rather than a fund.
 *
 * What is written here is what the tool actually does, in the same words it uses elsewhere,
 * including the part that undersells it — for most funds the date barely matters. That sentence
 * is the reason to trust the rest of the page, and it is also, in practice, the thing people are
 * searching for an answer to.
 *
 * The questions come from `lib/faq.ts` and are rendered in full, because the same list is
 * described to search engines as FAQPage structured data and markup that describes invisible
 * content is against Google's guidelines.
 */
import { useEffect } from "react";
import { Link } from "react-router";
import { SPREAD_THRESHOLD_PP } from "../lib/copy";
import { HOME_FAQ } from "../lib/faq";
import { setHead } from "../lib/head";
import { peekIndex } from "../lib/data";
import { HOME_TITLE, homeDescription } from "../lib/seo";

export function Home() {
  useEffect(() => {
    // The index isn't fetched for the home page (spec §9), so the count is used only when the
    // search box has already loaded it; otherwise the description simply omits the number.
    setHead({ title: HOME_TITLE, description: homeDescription(peekIndex()?.length), path: "/" });
  }, []);

  return (
    <div className="max-w-[65ch]">
      <p className="text-mute-text">
        For most funds the date barely moves the outcome. This shows you what the history says,
        and how much of it is noise.
      </p>
      <ol className="mt-7 flex list-none flex-col gap-3">
        {[
          "Search a fund you already hold.",
          "Read the chip: noise means the day barely matters.",
          "If you SIP on another date, tap it to see the gap.",
        ].map((step, index) => (
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

      <h2 className="mt-14 font-display text-[1.75rem] text-ink">What this answers</h2>
      <p className="mt-3 text-mute-text">
        One question, for one fund at a time: which day of the month to run your SIP on. For
        every fund covered here, a monthly SIP is simulated on each date from the 1st to the
        28th, across the whole published NAV history, and each one’s XIRR is solved by
        bisection. The date named is the one that came out highest. Nothing is weighted or
        tuned, and no parameter you can set will change it.
      </p>
      <p className="mt-3 text-mute-text">
        The calendar then shades all 28 dates against the one you are reading on, so you can see
        the shape of the difference rather than take a single number on trust. Every cell prints
        its own figure, because a deeply shaded cell is usually 20.31% against 20.34% — a real
        difference, and a tiny one.
      </p>

      <h2 className="mt-11 font-display text-[1.75rem] text-ink">Why it usually barely matters</h2>
      <p className="mt-3 text-mute-text">
        Across the funds here, the gap between the strongest and weakest date of the month is
        typically around a tenth of a percentage point of XIRR. On a corpus built over a decade
        that is a few thousand rupees — real money, and far less than most people expect. Where
        the spread is no wider than {SPREAD_THRESHOLD_PP} percentage points and the ordering of
        dates did not repeat between the two halves of a fund’s history, the verdict is noise,
        and the page says so instead of dressing the number up.
      </p>
      <p className="mt-3 text-mute-text">
        Missing an instalment costs more than the date does, on almost every fund here. That
        comparison is on each fund’s page, in rupees, because it is the one that changes what a
        reader should actually do: fund the SIP on a day the money is there.
      </p>

      <h2 className="mt-11 font-display text-[1.75rem] text-ink">Questions</h2>
      <dl className="mt-4 flex flex-col gap-3">
        {HOME_FAQ.map((entry) => (
          <div key={entry.question} className="rounded-[1.75rem] bg-raised px-[1.375rem] py-5">
            <dt className="font-bold text-ink">{entry.question}</dt>
            <dd className="mt-2 text-mute-text">{entry.answer}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-mute-text">
        <Link to="/funds" className="underline decoration-line underline-offset-2">
          Browse every fund by category
        </Link>
        , or search one above.
      </p>
    </div>
  );
}
