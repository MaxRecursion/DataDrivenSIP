/**
 * One fund (spec §6.6). The answer itself arrives in Phase 5; this phase settles the route,
 * the data it reads, and every state it can be in on a cold load.
 *
 * The prerender inlines this fund's own data, so the first render reads it synchronously —
 * on the build machine and again in the browser — and both produce the same markup. An effect
 * would not do: effects don't run during renderToString, which would leave the cold HTML
 * empty and hand hydration a mismatch. Funds reached from search fall back to the effect.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { FundArtifact } from "../../shared/artifacts";
import { loadFund, peekFund } from "../lib/data";
import { formatNavDate } from "../lib/format";
import { setHead } from "../lib/head";

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

  if (state.status === "loading") {
    // Space is reserved so nothing shifts when the fund lands.
    return <div className="min-h-40" aria-busy="true" />;
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

  const { fund } = state;
  return (
    <section>
      <h1 className="font-display text-2xl leading-snug font-bold text-balance">{fund.name}</h1>
      <p className="mt-1 text-mute-text">{fund.house}</p>
      <p className="text-sm text-mute-text">{fund.category}</p>
      <p className="mt-6 text-sm text-mute-text">
        NAVs from {formatNavDate(fund.navFrom)} to {formatNavDate(fund.navTo)}, {fund.instalments} monthly
        instalments.
      </p>
    </section>
  );
}
