/**
 * D13's second and third bullets, which `.lighthouserc.cjs`'s single-threshold assertions can't
 * express on their own: "warn below 0.95" and "report the score at each gate". The first bullet
 * ("fail below 0.90") is `.lighthouserc.cjs`'s own `error` assertion and already fails the run
 * before this script gets a turn — this only ever needs to report, and to warn on the band an
 * `error` assertion at 0.90 lets straight through.
 *
 * Reads what `lhci autorun` already wrote to `.lighthouseci/manifest.json`, whether or not its
 * own assertions passed, and exits 0 regardless: a low-but-passing score is worth seeing, never
 * worth failing the build over twice.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const WARN_BELOW = 0.95;

type ManifestRow = {
  url: string;
  isRepresentativeRun: boolean;
  summary?: { performance?: number };
};

async function main(): Promise<void> {
  const manifestPath = join(root, ".lighthouseci/manifest.json");
  let rows: ManifestRow[];
  try {
    rows = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestRow[];
  } catch {
    console.log("No .lighthouseci/manifest.json to summarise (collect must have failed before writing it).");
    return;
  }

  const representative = rows.filter((row) => row.isRepresentativeRun);
  if (representative.length === 0) {
    console.log("manifest.json has no representative run to report.");
    return;
  }

  for (const row of representative) {
    const score = row.summary?.performance;
    if (score === undefined) {
      console.log(`${row.url}: no performance score recorded`);
      continue;
    }
    console.log(`${row.url}: performance ${score.toFixed(2)}`);
    if (score < WARN_BELOW) {
      // The 0.90 floor is `.lighthouserc.cjs`'s own `error` assertion, so a run that reaches
      // this line already scored at least that — this is only ever the warn band.
      console.log(`::warning::Lighthouse performance on ${row.url} is ${score.toFixed(2)}, under the 0.95 warn line`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
