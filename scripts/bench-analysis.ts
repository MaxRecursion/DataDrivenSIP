/**
 * How long one fund takes to analyse, and what that means for a full pipeline run.
 * Run with `pnpm bench`.
 */
import { readFileSync } from "node:fs";
import { analyse } from "../pipeline/analysis/analyse";
import { buildHistory, parseNavRows } from "../pipeline/analysis/nav";

type MfapiFile = {
  meta: { scheme_code: number; scheme_name: string; fund_house: string; scheme_category: string };
  data: { date: string; nav: string }[];
};

const FUNDS_IN_UNIVERSE = 1_000; // PLAN.md D4
const RUNS = 5;

for (const file of ["119775.nav.json", "151713.nav.json"]) {
  const raw = JSON.parse(readFileSync(new URL(`../pipeline/fixtures/${file}`, import.meta.url), "utf8")) as MfapiFile;
  const history = buildHistory(parseNavRows(raw.data));
  const meta = {
    code: raw.meta.scheme_code,
    name: raw.meta.scheme_name,
    house: raw.meta.fund_house,
    category: raw.meta.scheme_category,
  };

  analyse(history, meta); // warm up
  const timings: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const started = performance.now();
    analyse(history, meta);
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(RUNS / 2)] ?? 0;
  const singleCore = (median * FUNDS_IN_UNIVERSE) / 1000 / 60;

  console.log(
    `${raw.meta.scheme_name}\n` +
      `  rows ${history.rows.length}, median ${median.toFixed(0)} ms/fund\n` +
      `  ${FUNDS_IN_UNIVERSE} funds: ${singleCore.toFixed(1)} min on one core, ` +
      `${(singleCore / 4).toFixed(1)} min on 4 workers (budget: 20 min)`,
  );
}
