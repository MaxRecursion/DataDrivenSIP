/**
 * One fund: the SIP day with the highest full-history XIRR, and the sentences that say how
 * much choosing it is actually worth.
 *
 * Everything visible is derived during render from one input — the artifact the pipeline
 * published — and nothing is cached in between. The pick and its copy are pure functions of
 * that artifact, so there is no second copy of the answer to fall out of step with it, and the
 * same fund always answers the same way however the reader arrived.
 *
 * The prerender inlines this fund's own data, so the first render reads it synchronously — on
 * the build machine and again in the browser — and both produce the same markup. An effect would
 * not do: effects don't run during renderToString, which would leave the cold HTML empty and
 * hand hydration a mismatch. Funds reached from search fall back to the effect.
 */
import { useEffect, useState } from "react";
import { useNavigationType, useParams } from "react-router";
import type { FundArtifact } from "../../shared/artifacts";
import { ANSWER_HEADING_ID, AnswerBlock } from "../components/answer-block";
import { CopyAnswer } from "../components/copy-answer";
import { GlanceStrip } from "../components/glance-strip";
import { HeroGrid } from "../components/hero-grid";
import { SipDaySelect } from "../components/sip-day-select";
import { StickyAnswer } from "../components/sticky-answer";
import { TodayLine } from "../components/today-line";
/**
 * Imported eagerly, against §6.5's "lazy chunk", on a measurement: the sections come to 1.79 kB
 * gzipped, not the ~7 kB the budget assumed. Lazy-loading them put a Suspense boundary into the
 * prerendered tree, so every build shipped a fallback and hydration answered with React #419.
 * Paying 1.79 kB buys that error away and puts the three headings in the cold HTML. uPlot, which
 * is the 24 kB that actually justified a chunk, stays lazy inside — and its boundary is only
 * created when a reader opens the section, long after hydration.
 */
import { ConfidenceSection, CurveSection, MattersSection } from "../components/disclosures";
import { pickAnswer } from "../lib/answer";
import { compareDayCopy, stickyCopy } from "../lib/compare";
import { disclosureCopy } from "../lib/disclosure";
import { heatSpanPp } from "../lib/heat";
import { readSipDay, rememberFund, writeSipDay } from "../lib/memory";
import { useReveal } from "../lib/use-reveal";
import { useWide } from "../lib/use-wide";
import { answerCopy } from "../lib/copy";
import { loadFund, peekFund } from "../lib/data";
import { setHead } from "../lib/head";
import { usePublishNavDate } from "./layout";

type State =
  | { status: "loading" }
  | { status: "ready"; fund: FundArtifact }
  | { status: "not-covered" }
  | { status: "unavailable" };

/** Strict: parseInt is lenient enough that /f/119775x would load fund 119775. */
function codeOf(code: string | undefined): number | null {
  return /^\d+$/.test(code ?? "") ? Number(code) : null;
}

function initialState(code: string | undefined): State {
  const parsed = codeOf(code);
  if (parsed === null) return { status: "not-covered" };
  const seeded = peekFund(parsed);
  return seeded ? { status: "ready", fund: seeded } : { status: "loading" };
}

export function FundPage() {
  const { code } = useParams();
  const [state, setState] = useState<State>(() => initialState(code));

  // Choosing a fund from search reuses this component rather than remounting it, so reset
  // during render instead of showing the previous fund until the next one arrives.
  const [showing, setShowing] = useState(code);
  if (code !== showing) {
    setShowing(code);
    setState(initialState(code));
  }

  useEffect(() => {
    const parsed = codeOf(code);
    // Seeded funds are already the final answer; nothing to fetch.
    if (parsed === null || peekFund(parsed)) return;

    let current = true;
    void loadFund(parsed).then((result) => {
      if (!current) return;
      if (result.ok) setState({ status: "ready", fund: result.fund });
      else setState({ status: result.reason === "not-covered" ? "not-covered" : "unavailable" });
    });
    return () => {
      current = false;
    };
  }, [code]);

  useEffect(() => {
    if (state.status !== "ready") return;
    setHead({
      title: `${state.fund.name} — SIP Date Planner`,
      description: `Which date of the month to run a SIP in ${state.fund.name}, and how much the date has actually mattered.`,
      url: `${window.location.origin}/f/${state.fund.code}`,
    });
  }, [state]);

  /**
   * The footer prints this fund's own last NAV date rather than the site-wide one (PLAN.md D21).
   * The layout reads seeded funds itself, which covers every prerendered page on both sides of
   * hydration; this hands it the date for a fund fetched after a search, which it has no way to
   * see. Cleared on the way out, so the home page's footer goes back to the site-wide date.
   */
  const publishNavDate = usePublishNavDate();
  const fund = state.status === "ready" ? state.fund : null;
  useEffect(() => {
    if (!fund) return;
    publishNavDate({ code: fund.code, navTo: fund.navTo });
    return () => publishNavDate(null);
  }, [fund, publishNavDate]);

  /**
   * Focus moves to the answer heading after a selection (PLAN.md §6.6), and only then. The three
   * ways this page renders are exactly the router's three navigation types, so nothing else has
   * to be tracked: choosing a fund from the search PUSHes, and a cold load or a back button is
   * a POP. Focusing on a cold load would move a reader who had just started typing in the
   * search field.
   */
  const arrivedFromSearch = useNavigationType() === "PUSH";
  const answered = fund !== null;
  useEffect(() => {
    if (!answered || !arrivedFromSearch) return;
    document.getElementById(ANSWER_HEADING_ID)?.focus();
  }, [code, answered, arrivedFromSearch]);

  /**
   * The reveal plays on one event only: a fund chosen inside the app. A cold deep link, a back
   * button and a reader who asked for reduced motion all land on the final state with nothing
   * animating at all (D10c, §8.3). Called before the early returns below, since it is a hook.
   */
  const reveal = useReveal(code, state.status === "ready");

  /**
   * On a large screen every section is held open, so the four-column dashboard shows the whole
   * answer without a scroll. Known only after mount; the columns themselves are CSS and are in
   * place from the first paint. Called here, before the early returns, because it is a hook.
   */
  const wide = useWide();
  const [compareDay, setCompareDay] = useState<number | null>(null);

  useEffect(() => {
    setCompareDay(readSipDay());
  }, [code]);

  useEffect(() => {
    if (state.status !== "ready") return;
    rememberFund({
      code: state.fund.code,
      name: state.fund.name,
      house: state.fund.house,
      category: state.fund.category,
      verdict: state.fund.verdict,
      spreadPp: state.fund.spreadPp,
    });
  }, [state]);

  const pickCompareDay = (day: number) => {
    writeSipDay(day);
    setCompareDay(day);
  };

  if (state.status === "loading") {
    // The window comes from the URL, not the fund, so the grid is already correct and already
    // the right size: when the data lands, the figures and the ring appear (PLAN.md §6.6).
    return (
      <section aria-busy="true">
        {/*
         * Reserved rather than absent. The ready state puts the fund's name, house and category
         * above the grid, so leaving the space out drops the grid and everything beneath it by
         * about 110px the instant the JSON arrives — which is the one path that reaches this
         * branch, a fund chosen from search rather than a seeded deep link (D13: CLS 0).
         */}
        <div className="min-h-[7.1rem]" />
        <HeroGrid answer={null} className="mt-6" />
        {/*
         * The grid is aria-hidden and the answer block isn't mounted yet, so without this the
         * page is silent for the whole fetch — aria-busy with nothing to describe.
         */}
        <p className="sr-only">Loading this fund’s answer.</p>
      </section>
    );
  }

  // The layout's own h1 is the home page's question, so each of these is the page heading.
  if (state.status === "not-covered") {
    return (
      <section className="max-w-[65ch]">
        <h1 className="font-display text-2xl font-bold">This fund isn’t covered</h1>
        <p className="mt-3 text-mute-text">
          The planner covers Direct plans with a growth option that have at least 37 months of
          published NAVs. Try searching for the fund by name.
        </p>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section className="max-w-[65ch]">
        <h1 className="font-display text-2xl font-bold">Couldn’t load this fund</h1>
        <p className="mt-3 text-mute-text">The data didn’t come back. Check your connection and try again.</p>
      </section>
    );
  }

  /**
   * `pickAnswer` throws when the window and the artifact share no date, and that is left to
   * throw: every artifact carries all 28, the pipeline validates that before publishing, and the
   * prerender renders every fund page at build time — so the only way to reach it is with an
   * artifact that would have failed the build first, loudly, which is where it should fail.
   */
  const answer = pickAnswer(state.fund);
  const copy = answerCopy(state.fund, answer);
  // One map of the figures the calendar prints and shades. The shading is relative to today's
  // date, which is a clock read, so the grid resolves it after mount and derives the heat there;
  // computing it here would bake the build machine's date into 994 prerendered pages.
  const values = new Map(state.fund.dates.map((row) => [row.d, row.xirr]));
  const corpora = new Map(state.fund.dates.map((row) => [row.d, row.corpus]));
  const spanPp = heatSpanPp(values);
  const disclosure = disclosureCopy(state.fund, answer);
  const compareRow = compareDay === null ? undefined : state.fund.dates.find((row) => row.d === compareDay);
  const compareText = compareRow ? compareDayCopy(answer.result, compareRow) : undefined;

  /*
   * One DOM for every width. Below 2xl the column wrappers are `display: contents`, so their
   * children become items of the flex column and `order-*` keeps the phone's reading order:
   * name, calendar, answer, curve, confidence, matters. From 2xl the first two wrappers are
   * real grid columns (name and calendar; answer and curve) and confidence and matters stay
   * `contents`, so they occupy columns 3 and 4 instead of stacking in a span.
   */
  const sections = { fund: state.fund, answer, copy: disclosure, open: wide };
  return (
    <section className="flex flex-col pb-16 2xl:grid 2xl:grid-cols-4 2xl:items-start 2xl:gap-x-10 2xl:pb-0">
      <div className="contents 2xl:block">
        <div className="order-1 2xl:order-none">
          <h1 className="font-display text-2xl leading-snug font-bold text-balance">{state.fund.name}</h1>
          <p className="mt-1 text-mute-text">{state.fund.house}</p>
          <p className="text-sm text-mute-text">{state.fund.category}</p>
        </div>
        <div className="order-2 2xl:order-none">
          <HeroGrid
            answer={answer.date}
            values={values}
            corpora={corpora}
            spanPp={spanPp}
            selected={compareDay}
            onSelectDay={pickCompareDay}
            reveal={reveal}
            className="mt-6 2xl:mt-4"
          />
          <GlanceStrip fund={state.fund} />
        </div>
      </div>

      <div className="contents 2xl:block">
        <div className="order-3 2xl:order-none [&>section]:2xl:mt-0">
          <AnswerBlock
            copy={copy}
            answerDate={answer.date}
            verdict={state.fund.verdict}
            compareText={compareText}
            reveal={reveal}
          />
          <div className="2xl:mt-2 2xl:flex 2xl:flex-wrap 2xl:items-baseline 2xl:gap-x-6">
            <TodayLine named={answer.result} dates={state.fund.dates} />
            <SipDaySelect value={compareDay} onChange={pickCompareDay} />
            <CopyAnswer fund={state.fund} answer={answer} />
          </div>
        </div>
        <div className="order-4 mt-10 2xl:order-none 2xl:mt-2">
          <CurveSection {...sections} />
        </div>
      </div>

      <div className="contents">
        <div className="order-5 2xl:order-none">
          <ConfidenceSection {...sections} />
        </div>
        <div className="order-6 2xl:order-none">
          <MattersSection {...sections} />
        </div>
      </div>
      <StickyAnswer text={stickyCopy(state.fund, answer)} />
    </section>
  );
}
