/**
 * One fund (PLAN.md §6.1, §6.4, §6.6): the window the reader's salary allows, the one date
 * inside it this fund's history points at, and the sentences that say how much that is worth.
 *
 * Everything visible is derived during render from two inputs — the artifact the pipeline
 * published and the parameters in the URL — and nothing is cached in between. A window, a pick
 * and its copy are pure functions of those two, so there is no third copy of the answer to fall
 * out of step with the address bar, and the back button lands on exactly what it left.
 *
 * The prerender inlines this fund's own data, so the first render reads it synchronously — on
 * the build machine and again in the browser — and both produce the same markup. An effect would
 * not do: effects don't run during renderToString, which would leave the cold HTML empty and
 * hand hydration a mismatch. Funds reached from search fall back to the effect.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigationType, useParams, useSearchParams } from "react-router";
import type { FundArtifact } from "../../shared/artifacts";
import { ANSWER_HEADING_ID, AnswerBlock } from "../components/answer-block";
import { HeroGrid } from "../components/hero-grid";
/**
 * Imported eagerly, against §6.5's "lazy chunk", on a measurement: the sections come to 1.79 kB
 * gzipped, not the ~7 kB the budget assumed. Lazy-loading them put a Suspense boundary into the
 * prerendered tree, so every build shipped a fallback and hydration answered with React #419.
 * Paying 1.79 kB buys that error away and puts the three headings in the cold HTML. uPlot, which
 * is the 24 kB that actually justified a chunk, stays lazy inside — and its boundary is only
 * created when a reader opens the section, long after hydration.
 */
import Disclosures from "../components/disclosures";
import { WindowControls } from "../components/window-controls";
import { deviationsFromWindow, pickAnswer, windowEdges } from "../lib/answer";
import { disclosureCopy } from "../lib/disclosure";
import { heatFromDeviations, heatSpanPp } from "../lib/heat";
import { useReveal } from "../lib/use-reveal";
import { answerCopy } from "../lib/copy";
import { loadFund, peekFund } from "../lib/data";
import { setHead } from "../lib/head";
import { paramsToSearch, parseParams, type AppParams } from "../lib/url";
import { safeWindow } from "../lib/window";
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
  const [search, setSearchParams] = useSearchParams();

  // Choosing a fund from search reuses this component rather than remounting it, so reset
  // during render instead of showing the previous fund until the next one arrives.
  const [showing, setShowing] = useState(code);
  if (code !== showing) {
    setShowing(code);
    setState(initialState(code));
  }

  const params = parseParams(search);
  // Not `window`: that name is the global this file must never touch during render.
  const windowDates = safeWindow(params);

  /**
   * Salary and buffer replace the history entry (PLAN.md §6.1). Choosing a fund is a move
   * between pages and pushes one; adjusting the window is the same page answering again, and a
   * reader who tried three salary days shouldn't have to press back three times to leave.
   * `paramsToSearch` drops defaults, so the plain URL stays plain.
   */
  const onParamsChange = useCallback(
    (next: AppParams) => setSearchParams(paramsToSearch(next), { replace: true }),
    [setSearchParams],
  );

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
   * to be tracked: choosing a fund from the search PUSHes, a salary or buffer change REPLACEs
   * (see `onParamsChange`), and a cold load or a back button is a POP. Focusing on a cold load
   * would move a reader who had just started typing in the search field; focusing on a parameter
   * change would pull focus out of the select they are still using.
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

  if (state.status === "loading") {
    // The window comes from the URL, not the fund, so the grid is already correct and already
    // the right size: when the data lands only the marigold cell appears (PLAN.md §6.6).
    return (
      <section aria-busy="true">
        {/*
         * Reserved rather than absent. The ready state puts the fund's name, house and category
         * above the grid, so leaving the space out drops the grid and everything beneath it by
         * about 110px the instant the JSON arrives — which is the one path that reaches this
         * branch, a fund chosen from search rather than a seeded deep link (D13: CLS 0).
         */}
        <div className="min-h-[7.1rem]" />
        <HeroGrid window={windowDates} answer={null} className="mt-6" />
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
  const answer = pickAnswer(state.fund, windowDates);
  const copy = answerCopy(state.fund, answer, windowDates);
  // Shares its arithmetic with the pick, so the marigold cell and the sentence under it are the
  // same figure by construction rather than by two calculations happening to agree.
  const edges = windowEdges(state.fund, windowDates);
  // Shading covers all 28 dates, not just the window: the calendar's job is to show what the
  // whole month did, and fading is what says which ten the reader may actually use. It shades
  // the same deviations the cells print, measured from the same middle, so a cell can never
  // read green while the figure inside it reads minus.
  const deviations = deviationsFromWindow(state.fund, windowDates);
  const heat = heatFromDeviations(deviations);
  const spanPp = heatSpanPp(deviations);
  const disclosure = disclosureCopy(state.fund, answer, windowDates);

  return (
    <section>
      <h1 className="font-display text-2xl leading-snug font-bold text-balance">{state.fund.name}</h1>
      <p className="mt-1 text-mute-text">{state.fund.house}</p>
      <p className="text-sm text-mute-text">{state.fund.category}</p>

      <HeroGrid
        window={windowDates}
        answer={answer.date}
        heat={heat}
        spanPp={spanPp}
        edges={edges}
        reveal={reveal}
        className="mt-6"
      />
      <AnswerBlock copy={copy} answerDate={answer.date} reveal={reveal} />
      <WindowControls params={params} onChange={onParamsChange} />

      <Disclosures fund={state.fund} answer={answer} window={windowDates} copy={disclosure} />
    </section>
  );
}
