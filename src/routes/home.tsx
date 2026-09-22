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
    <div>
      <p className="max-w-[65ch] text-mute-text">
        For most funds the date barely moves the outcome. This shows you what the history says,
        and how much of it is noise.
      </p>
      <ol className="mt-6 max-w-[65ch] list-decimal space-y-2 pl-5 text-mute-text">
        <li>Search a fund you already hold.</li>
        <li>Read the chip: noise means the day barely matters.</li>
        <li>If you SIP on another date, tap it to see the gap.</li>
      </ol>
    </div>
  );
}
