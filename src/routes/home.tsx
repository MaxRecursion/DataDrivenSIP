/**
 * The landing page: the question, the field, and one line about what the answer is worth.
 * No grid and no demo fund — the hero arrives with a real fund in Phase 5.
 */
import { useEffect } from "react";
import { setHead } from "../lib/head";

export function Home() {
  useEffect(() => {
    setHead({
      title: "SIP Date Planner",
      description:
        "Pick a SIP date for your mutual fund, with an honest read on how much the date matters.",
    });
  }, []);

  return (
    <p className="max-w-[65ch] text-mute-text">
      For most funds the date barely moves the outcome. This shows you what the history says,
      and how much of it is noise.
    </p>
  );
}
