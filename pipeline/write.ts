/**
 * Publishes the artifacts (PLAN.md §5, D20).
 *
 * Fund files live under a directory named for the data version, so a URL is only ever asked
 * for once per build; index.json and meta.json keep stable paths. Fund data is written
 * first, then the index, then meta, so a half-finished run is never pointed at.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FundArtifact, IndexRow, Meta, Trending } from "../shared/artifacts";
import { dayFromIso } from "./analysis/dates";
import { topMovers, type Momentum } from "./analysis/momentum";
import { checkArtifactSize, checkIndexSize, validateArtifact } from "./validate";

export type WriteOptions = {
  artifacts: readonly FundArtifact[];
  builtAt: string;
  pipelineVersion: string;
  /**
   * How many versions to retain in total, the new one included. Older ones stay briefly so a
   * page loaded during a previous build can still fetch its data.
   */
  keepVersions?: number;
  source?: string;
  /** Each fund's month-on-month NAV change, for trending.json. Absent means none is written. */
  momentum?: readonly Momentum[];
};

export type WriteResult = {
  dataVersion: string;
  fundCount: number;
  navAsOf: string;
  versionsKept: string[];
};

const VERSION_DIR = /^\d{4}-\d{2}-\d{2}\./;

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temp = `${path}.tmp`;
  await writeFile(temp, contents);
  await rename(temp, path);
}

/** The date most funds were last priced on. */
function navAsOfFrom(artifacts: readonly FundArtifact[]): string {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) counts.set(artifact.navTo, (counts.get(artifact.navTo) ?? 0) + 1);
  let best = "";
  let bestCount = -1;
  for (const [date, count] of [...counts].sort(([a], [b]) => (a < b ? 1 : -1))) {
    if (count > bestCount) {
      best = date;
      bestCount = count;
    }
  }
  return best;
}

export async function writeArtifacts(outDir: string, options: WriteOptions): Promise<WriteResult> {
  const { artifacts, builtAt, pipelineVersion, keepVersions = 3, source = "mfapi.in", momentum } = options;
  if (artifacts.length === 0) throw new Error("Refusing to publish an empty data set");

  const sorted = [...artifacts].sort((a, b) => a.code - b.code);
  for (const artifact of sorted) {
    const issues = [...validateArtifact(artifact), ...checkArtifactSize(artifact)];
    if (issues.length > 0) {
      throw new Error(`Fund ${artifact.code} is not valid: ${issues.map((issue) => issue.problem).join("; ")}`);
    }
  }

  const navAsOf = navAsOfFrom(sorted);
  const payloads = sorted.map((artifact) => JSON.stringify(artifact));
  const digest = createHash("sha256").update(payloads.join("\n")).digest("hex").slice(0, 8);
  const dataVersion = `${navAsOf}.${digest}`;

  // Everything that can fail happens before a single file is written, so a rejected run never
  // leaves a half-built version directory behind for pruning to trip over.
  const index: IndexRow[] = sorted.map((artifact) => [artifact.code, artifact.name, artifact.house, artifact.category]);
  const indexJson = JSON.stringify(index);
  const indexIssues = checkIndexSize(indexJson);
  if (indexIssues.length > 0) throw new Error(indexIssues.map((issue) => issue.problem).join("; "));

  const fundsDir = join(outDir, dataVersion, "funds");
  try {
    await mkdir(fundsDir, { recursive: true });
    await Promise.all(
      sorted.map((artifact, index_) => writeFile(join(fundsDir, `${artifact.code}.json`), payloads[index_] ?? "")),
    );
  } catch (error) {
    await rm(join(outDir, dataVersion), { recursive: true, force: true });
    throw error;
  }

  const meta: Meta = { builtAt, fundCount: sorted.length, navAsOf, pipelineVersion, dataVersion, source };
  // Written through a temp file and renamed, so a reader never sees half an index.
  await writeAtomic(join(outDir, "index.json"), indexJson);
  if (momentum) {
    // Only funds that are published, and priced on navAsOf itself — see analysis/momentum.ts.
    const byCode = new Map(sorted.map((artifact) => [artifact.code, artifact]));
    const published = momentum.filter((entry) => byCode.has(entry.code));
    const trending: Trending = {
      navAsOf,
      basis: "NAV change over the past month",
      funds: topMovers(published, dayFromIso(navAsOf)).map((entry) => {
        const artifact = byCode.get(entry.code)!;
        return { code: entry.code, name: artifact.name, house: artifact.house, monthPct: entry.monthPct };
      }),
    };
    await writeAtomic(join(outDir, "trending.json"), `${JSON.stringify(trending)}\n`);
  }
  await writeAtomic(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  const older = (await readdir(outDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && VERSION_DIR.test(entry.name) && entry.name !== dataVersion)
    .map((entry) => entry.name)
    .sort()
    .reverse();
  // keepVersions counts every version retained, the new one included.
  const kept = [dataVersion, ...older.slice(0, Math.max(0, keepVersions - 1))];
  await Promise.all(
    older
      .filter((version) => !kept.includes(version))
      .map((version) => rm(join(outDir, version), { recursive: true, force: true })),
  );

  return { dataVersion, fundCount: sorted.length, navAsOf, versionsKept: kept };
}
