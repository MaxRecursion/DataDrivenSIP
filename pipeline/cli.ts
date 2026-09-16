/**
 * `pnpm pipeline` — the only place in the pipeline that reads a clock or picks a source.
 *
 * Flags:
 *   --source mfapi|fixture   where NAVs come from (default mfapi)
 *   --as-of YYYY-MM-DD       ignore NAVs published later, for a reproducible run
 *   --codes 119775,151713    only these schemes
 *   --limit N                only the first N schemes
 *   --full                   refetch whole histories instead of merging a tail
 *   --out DIR                output directory (default public/data)
 *   --cache DIR              cache directory (default pipeline/.cache)
 *   --concurrency N          requests in flight (default 12)
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Meta } from "../shared/artifacts";
import { dayFromIso } from "./analysis/dates";
import { runPipeline } from "./run";
import { fixtureSource } from "./sources/fixture";
import { mfapiSource } from "./sources/mfapi";
import { checkFundCount } from "./validate";

const root = fileURLToPath(new URL("..", import.meta.url));
const PIPELINE_VERSION = "1.0.0";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** Today in India, where the NAV day is defined. */
function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", dateStyle: "short" }).format(new Date());
}

async function previousFundCount(outDir: string): Promise<number | null> {
  try {
    const meta = JSON.parse(await readFile(join(outDir, "meta.json"), "utf8")) as Meta;
    return typeof meta.fundCount === "number" ? meta.fundCount : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const outDir = flag("out") ?? join(root, "public/data");
  const cacheDir = flag("cache") ?? join(root, "pipeline/.cache");
  const asOf = flag("as-of");
  const codes = flag("codes")
    ?.split(",")
    .map((code) => Number.parseInt(code.trim(), 10))
    .filter((code) => Number.isFinite(code));
  const limit = flag("limit");
  const concurrency = flag("concurrency");
  const useFixtures = flag("source") === "fixture";

  // A partial run publishes a partial set, and its meta.json would become the baseline that
  // disarms the next run's fund-count guard. Keep it away from the real output directory.
  if ((codes?.length || limit) && flag("out") === undefined) {
    console.error("GUARD: --codes and --limit write a partial data set, so they need an explicit --out");
    process.exit(1);
  }

  const previous = await previousFundCount(outDir);
  const report = await runPipeline({
    source: useFixtures ? fixtureSource() : mfapiSource(),
    outDir,
    cacheDir,
    // --as-of fixes the whole run, the scheme list included, not just which NAVs are read.
    today: asOf ? dayFromIso(asOf) : dayFromIso(todayInIndia()),
    builtAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    ...(asOf ? { asOf: dayFromIso(asOf) } : {}),
    ...(codes?.length ? { codes } : {}),
    ...(limit ? { limit: Number.parseInt(limit, 10) } : {}),
    ...(concurrency ? { concurrency: Number.parseInt(concurrency, 10) } : {}),
    full: has("full"),
  });

  console.log("\nfunnel:");
  for (const [reason, count] of [...report.funnel].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(20)} ${count}`);
  }
  if (report.trimmed > 0) console.log(`\n${report.trimmed} histories cut at a NAV re-denomination`);

  if (report.failures.length > 0) {
    console.log(`\n${report.failures.length} could not be analysed, first few:`);
    for (const failure of report.failures.slice(0, 5)) console.log(`  ${failure.code}: ${failure.reason}`);
  }
  console.log(`took ${(report.elapsedMs / 1000).toFixed(1)}s`);

  if (report.write === null) {
    console.error("GUARD: no fund could be analysed, so nothing was published");
    process.exit(1);
  }
  console.log(`\n${report.write.fundCount} funds, NAVs to ${report.write.navAsOf}, version ${report.write.dataVersion}`);
  console.log(`versions kept: ${report.write.versionsKept.join(", ")}`);

  // The upstream-breakage guard: a big drop means the source broke, not that funds vanished.
  const guard = codes?.length || limit ? [] : checkFundCount(report.write.fundCount, previous);
  if (guard.length > 0) {
    for (const issue of guard) console.error(`GUARD: ${issue.problem}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
