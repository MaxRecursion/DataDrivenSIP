/**
 * Nothing is published without passing these (PLAN.md §3.4). A bad artifact should fail the
 * run, not reach a reader.
 */
import { gzipSync } from "node:zlib";
import type { FundArtifact } from "../shared/artifacts";
import { SIP_DATES } from "./analysis/simulate";

export type ValidationIssue = { code?: number; problem: string };

export const MAX_FUND_GZIP_BYTES = 2048;
export const MAX_INDEX_GZIP_BYTES = 120_000;
export const FUND_COUNT_RANGE: [number, number] = [800, 1600];
export const MAX_COUNT_DROP = 0.1;

const VERDICTS = new Set(["noise", "marginal", "meaningful"]);
const CONFIDENCE = new Set(["full", "reduced"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const finiteOrNull = (value: unknown): value is number | null => value === null || finite(value);

export function gzipBytes(json: string): number {
  return gzipSync(Buffer.from(json), { level: 9 }).length;
}

export function validateArtifact(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const artifact = input as Partial<FundArtifact> | null;
  const code = typeof artifact?.code === "number" ? artifact.code : undefined;
  const add = (problem: string) => issues.push(code === undefined ? { problem } : { code, problem });

  if (!artifact || typeof artifact !== "object") return [{ problem: "not an object" }];

  for (const field of ["name", "house", "category"] as const) {
    if (typeof artifact[field] !== "string" || artifact[field].length === 0) add(`${field} is missing`);
  }
  if (!finite(artifact.code)) add("code is missing");
  for (const field of ["navFrom", "navTo"] as const) {
    if (typeof artifact[field] !== "string" || !ISO_DATE.test(artifact[field])) add(`${field} is not YYYY-MM-DD`);
  }
  if (!finite(artifact.instalments) || artifact.instalments <= 0) add("instalments is not a positive number");
  if (!finite(artifact.spreadPp)) add("spreadPp is not finite");
  if (!finite(artifact.spreadRupees) || !Number.isInteger(artifact.spreadRupees)) add("spreadRupees is not whole");
  if (!finiteOrNull(artifact.stability)) add("stability is not finite or null");
  if (typeof artifact.metricsAgree !== "boolean") add("metricsAgree is missing");
  if (!VERDICTS.has(artifact.verdict as string)) add(`verdict ${String(artifact.verdict)} is not a known verdict`);
  if (!CONFIDENCE.has(artifact.confidence as string)) add(`confidence ${String(artifact.confidence)} is unknown`);
  if (!finite(artifact.windows) || artifact.windows < 0 || !Number.isInteger(artifact.windows)) {
    add("windows is not a whole count");
  }

  const dates = artifact.dates;
  if (!Array.isArray(dates) || dates.length !== SIP_DATES.length) {
    add(`dates should hold ${SIP_DATES.length} entries`);
    return issues;
  }

  const windows = finite(artifact.windows) ? artifact.windows : 0;
  dates.forEach((date, index) => {
    if (date?.d !== index + 1) add(`dates[${index}] should be date ${index + 1}`);
    if (!finite(date?.xirr)) add(`date ${index + 1} has no rate`);
    if (!finite(date?.corpus) || !Number.isInteger(date.corpus)) add(`date ${index + 1} corpus is not whole`);
    if (!finite(date?.w)) add(`date ${index + 1} win count is not finite`);
    if (!finiteOrNull(date?.meanPct) || !finiteOrNull(date?.topQ)) add(`date ${index + 1} has a broken percentile`);
    // Percentiles exist exactly when rolling windows do.
    const hasPercentiles = date?.meanPct !== null && date?.topQ !== null;
    if (windows > 0 && !hasPercentiles) add(`date ${index + 1} is missing percentiles despite ${windows} windows`);
    if (windows === 0 && hasPercentiles) add(`date ${index + 1} has percentiles despite no windows`);
  });

  return issues;
}

/** The search index is fetched on the first keystroke, so its size is a user-facing budget. */
export function checkIndexSize(json: string, limit: number = MAX_INDEX_GZIP_BYTES): ValidationIssue[] {
  const bytes = gzipBytes(json);
  return bytes <= limit ? [] : [{ problem: `index.json is ${bytes} B gzipped, over the ${limit} B budget` }];
}

export function checkArtifactSize(artifact: FundArtifact): ValidationIssue[] {
  const bytes = gzipBytes(JSON.stringify(artifact));
  return bytes <= MAX_FUND_GZIP_BYTES
    ? []
    : [{ code: artifact.code, problem: `${bytes} B gzipped, over the ${MAX_FUND_GZIP_BYTES} B budget` }];
}

/** The nightly guard: a big drop means upstream broke, not that funds disappeared. */
export function checkFundCount(
  current: number,
  previous: number | null,
  range: [number, number] = FUND_COUNT_RANGE,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (current < range[0] || current > range[1]) {
    issues.push({ problem: `fund count ${current} is outside the expected ${range[0]}–${range[1]}` });
  }
  if (previous !== null && previous > 0 && current < previous * (1 - MAX_COUNT_DROP)) {
    issues.push({ problem: `fund count fell from ${previous} to ${current}, more than ${MAX_COUNT_DROP * 100}%` });
  }
  return issues;
}
