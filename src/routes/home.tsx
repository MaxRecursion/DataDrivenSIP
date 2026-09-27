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
import { HOME_FAQ } from "../lib/faq";
import { setHead } from "../lib/head";
import { HOME_DESCRIPTION, HOME_TITLE } from "../lib/seo";

export function Home() {
  useEffect(() => {
    setHead({ title: HOME_TITLE, description: HOME_DESCRIPTION });
  }, []);

  return (
    <div className="max-w-[65ch]">
      <p className="text-mute-text">
        For most funds the date barely moves the outcome. This shows you what the history says,
        and how much of it is noise.
      </p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-mute-text">
        <li>Search a fund you already hold.</li>
        <li>Read the chip: noise means the day barely matters.</li>
        <li>If you SIP on another date, tap it to see the gap.</li>
      </ol>

      <h2 className="mt-12 font-display text-2xl font-bold text-ink">What this answers</h2>
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
        its own figure, because a deep red cell is usually 20.31% against 20.34% — a real
        difference, and a tiny one.
      </p>

      <h2 className="mt-10 font-display text-2xl font-bold text-ink">Why it usually barely matters</h2>
      <p className="mt-3 text-mute-text">
        Across the funds here, the gap between the strongest and weakest date of the month is
        typically around a tenth of a percentage point of XIRR. On a corpus built over a decade
        that is a few thousand rupees — real money, and far less than most people expect. Where
        the spread is under 0.25 percentage points, or where the ordering of dates did not
        repeat between the two halves of a fund’s history, the verdict is noise, and the page
        says so instead of dressing the number up.
      </p>
      <p className="mt-3 text-mute-text">
        Missing an instalment costs more than the date does, on almost every fund here. That
        comparison is on each fund’s page, in rupees, because it is the one that changes what a
        reader should actually do: fund the SIP on a day the money is there.
      </p>

      <h2 className="mt-10 font-display text-2xl font-bold text-ink">Questions</h2>
      <dl className="mt-4">
        {HOME_FAQ.map((entry) => (
          <div key={entry.question} className="mt-6 first:mt-0">
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
