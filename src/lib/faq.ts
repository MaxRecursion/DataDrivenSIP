/**
 * The home page's questions and answers, in one place because they are used twice: rendered on
 * the page, and described to search engines as `FAQPage` structured data (`seo.ts`).
 *
 * That duplication is the whole point of putting them here. Structured data that describes
 * content a reader can't see on the page is against Google's guidelines and is how a site loses
 * rich results rather than earning them — so there is exactly one list, the page renders all of
 * it, and the markup describes what was rendered.
 *
 * The answers are the same ones the product gives elsewhere, in the same words, including the
 * unflattering one: for most funds the date barely matters, and saying so here is what makes the
 * rest of the page believable.
 */

export type FaqEntry = { question: string; answer: string };

export const HOME_FAQ: readonly FaqEntry[] = [
  {
    question: "Does the date of the month I run my SIP on actually matter?",
    answer:
      "For most funds, barely. Across the funds covered here the gap between the strongest and " +
      "weakest date of the month is usually around a tenth of a percentage point of XIRR, which " +
      "on a corpus built over a decade is a few thousand rupees. This tool still names one date, " +
      "because picking a date and automating it beats deliberating every month, and then it says " +
      "plainly how little the choice was worth.",
  },
  {
    question: "How is the date chosen?",
    answer:
      "For each fund, a monthly SIP is simulated on every date from the 1st to the 28th over the " +
      "fund's whole published NAV history, and each one's XIRR is solved by bisection. The date " +
      "named is simply the one with the highest full-history XIRR, with ties going to the earlier " +
      "date. Nothing is weighted, smoothed or tuned.",
  },
  {
    question: "What does a verdict of noise mean?",
    answer:
      "That the 28 dates finished close enough together that the difference between them is not " +
      "evidence of a date effect. A fund is called noise when its spread is under 0.25 percentage " +
      "points or when the ordering of dates did not repeat between the two halves of its history. " +
      "Noise is a correct answer, not a failure to find one, and it is the answer for most funds.",
  },
  {
    question: "Why do the dates stop at the 28th?",
    answer:
      "Because February has no 29th in three years out of four. A SIP set for the 30th is not a " +
      "monthly instruction at all — it will be moved or missed several times a year — so dates " +
      "from the 1st to the 28th are the only ones that mean the same thing every month.",
  },
  {
    question: "Does this tell me which mutual fund to invest in?",
    answer:
      "No, and it never will. There is no ranking of funds here, in the interface, the copy or " +
      "the data. The question it answers is which date of the month, for one fund you have " +
      "already chosen. It is an educational tool, not investment advice.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "AMFI's published NAVs, via mfapi.in, refreshed nightly. Each fund's history is cleaned " +
      "before it is used: single bad prints are dropped, and a series is cut at a re-denomination " +
      "or at a gap longer than 60 days. A fund whose history had to be cut is always marked " +
      "reduced confidence, because a truncated series must not be presented as the fund's whole life.",
  },
  {
    question: "Will the answer change over time?",
    answer:
      "It can. The figures are recomputed nightly from the full history, so a fund's strongest " +
      "date can move as new NAVs arrive — and on a fund whose verdict is noise, it moves more " +
      "easily, because the dates were never far apart. That instability is itself the point: a " +
      "date that changes when one month is added was never worth rearranging your money for.",
  },
];
