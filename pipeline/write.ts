/**
 * Publishes the artifacts (PLAN.md §5, D20).
 *
 * Fund files live under a directory named for the data version, so a URL is only ever asked
 * for once per build; index.json and meta.json keep stable paths. Fund data is written
 * first, then the index, then meta, so a half-finished run is never pointed at.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FundArtifact, IndexRow, Meta } from "../shared/artifacts";
import { checkArtifactSize, checkIndexSize, validateArtifact } from "./validate";

export type WriteOptions = {
  artifacts: readonly FundArtifact[];
  builtAt: string;
  pipelineVersion: string;
  /** Older versions stay briefly so a page loaded moments ago can still fetch its data. */
  keepVersions?: number;
  source?: string;
};

export type WriteResult = {
  dataVersion: string;
  fundCount: number;
  navAsOf: string;
  versionsKept: string[];
};

const VERSION_DIR = /^\d{4}-\d{2}-\d{2}\./;

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
  const { artifacts, builtAt, pipelineVersion, keepVersions = 2, source = "mfapi.in" } = options;
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

  const fundsDir = join(outDir, dataVersion, "funds");
  await mkdir(fundsDir, { recursive: true });
  await Promise.all(sorted.map((artifact, index) => writeFile(join(fundsDir, `${artifact.code}.json`), payloads[index] ?? "")));

  const index: IndexRow[] = sorted.map((artifact) => [artifact.code, artifact.name, artifact.house, artifact.category]);
  const indexJson = JSON.stringify(index);
  const indexIssues = checkIndexSize(indexJson);
  if (indexIssues.length > 0) throw new Error(indexIssues.map((issue) => issue.problem).join("; "));
  await writeFile(join(outDir, "index.json"), indexJson);

  const meta: Meta = {
    builtAt,
    fundCount: sorted.length,
    navAsOf,
    pipelineVersion,
    dataVersion,
    source,
  };
  await writeFile(join(outDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  const versions = (await readdir(outDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && VERSION_DIR.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const keep = new Set([dataVersion, ...versions.slice(0, Math.max(1, keepVersions))]);
  const kept = versions.filter((version) => keep.has(version));
  await Promise.all(
    versions.filter((version) => !keep.has(version)).map((version) => rm(join(outDir, version), { recursive: true, force: true })),
  );

  return { dataVersion, fundCount: sorted.length, navAsOf, versionsKept: kept };
}
