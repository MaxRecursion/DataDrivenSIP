/**
 * The run itself: list, filter, fetch, analyse, publish (PLAN.md §3).
 *
 * Analysis stays in this process. A 13-year fund takes about 225 ms, so a thousand funds is
 * roughly four minutes on one core against a twenty-minute budget; worker threads would buy
 * time we don't need and cost determinism we do.
 */
import { analyse, AnalysisError, type FundMeta } from "./analysis/analyse";
import type { DayNum } from "./analysis/dates";
import { buildHistory, parseNavRows } from "./analysis/nav";
import { mergeRows, readEntry, writeEntry } from "./cache";
import {
  checkHistory,
  filterSchemes,
  trimAtDiscontinuity,
  type ExclusionReason,
  type HistoryRejection,
} from "./eligibility";
import { pool } from "./fetch";
import type { NavSource, RawNavRow, SchemeSummary } from "./sources/types";
import { writeArtifacts, type WriteResult } from "./write";
import type { FundArtifact } from "../shared/artifacts";

export type PipelineOptions = {
  source: NavSource;
  outDir: string;
  /** Today, in the timezone the caller cares about. Only the caller reads a clock. */
  today: DayNum;
  /** Ignore NAVs published after this day. Makes a run reproducible. */
  asOf?: DayNum;
  builtAt: string;
  pipelineVersion: string;
  cacheDir?: string;
  codes?: number[];
  limit?: number;
  /** Refetch whole histories instead of merging a tail onto the cache. */
  full?: boolean;
  concurrency?: number;
  /** Reserved. Analysis runs in this process; see the note above. */
  workers?: number;
  keepVersions?: number;
  log?: (message: string) => void;
};

export type PipelineFailure = { code: number; reason: string };

export type PipelineReport = {
  schemes: number;
  eligible: number;
  analysed: number;
  /** Funds whose history was cut at a NAV re-denomination before analysis. */
  trimmed: number;
  funnel: Map<ExclusionReason | HistoryRejection | "not-found", number>;
  failures: PipelineFailure[];
  /** Null when nothing could be analysed: a run that publishes nothing must not blank the site. */
  write: WriteResult | null;
  elapsedMs: number;
};

const DEFAULT_CONCURRENCY = 12;
/** Enough overlap to notice a corrected NAV, cheap enough to ignore. */
const TAIL_DAYS = 10;

export async function runPipeline(options: PipelineOptions): Promise<PipelineReport> {
  const started = Date.now();
  const log = options.log ?? ((message: string) => console.log(message));
  const funnel = new Map<ExclusionReason | HistoryRejection | "not-found", number>();
  const drop = (reason: ExclusionReason | HistoryRejection | "not-found") =>
    funnel.set(reason, (funnel.get(reason) ?? 0) + 1);

  const all = await options.source.listSchemes();
  let schemes = options.codes ? all.filter((scheme) => options.codes?.includes(scheme.code)) : all;
  if (options.limit !== undefined) schemes = schemes.slice(0, options.limit);
  log(`${all.length} schemes listed, ${schemes.length} considered`);

  const { eligible, excluded } = filterSchemes(schemes, options.today);
  for (const [reason, count] of excluded) funnel.set(reason, count);
  log(`${eligible.length} pass the scheme-list rules`);

  const failures: PipelineFailure[] = [];
  const artifacts: FundArtifact[] = [];

  const results = await pool(eligible, options.concurrency ?? DEFAULT_CONCURRENCY, async (scheme) => {
    try {
      const rows = await rowsFor(scheme, options);
      if (rows === null) return { scheme, drop: "not-found" as const };

      const parsed = parseNavRows(rows).filter((row) => options.asOf === undefined || row.day <= options.asOf);
      if (parsed.length === 0) return { scheme, drop: "not-found" as const };

      // Anything before a NAV re-denomination belongs to a different series.
      const { history, trimmedAt } = trimAtDiscontinuity(buildHistory(parsed));
      const check = checkHistory(history);
      if (!check.ok) return { scheme, drop: check.reason };

      const meta: FundMeta = {
        code: scheme.code,
        name: scheme.name,
        house: scheme.house,
        category: scheme.category,
      };
      return { scheme, artifact: analyse(history, meta), trimmed: trimmedAt !== null };
    } catch (error) {
      const reason = error instanceof AnalysisError ? error.reason : (error as Error).message;
      return { scheme, failure: reason };
    }
  });

  let trimmed = 0;
  for (const result of results) {
    if ("artifact" in result && result.artifact) {
      artifacts.push(result.artifact);
      if ("trimmed" in result && result.trimmed) trimmed++;
    }
    else if ("drop" in result && result.drop) drop(result.drop);
    else if ("failure" in result && result.failure) failures.push({ code: result.scheme.code, reason: result.failure });
  }
  log(`${artifacts.length} analysed, ${failures.length} could not be analysed`);

  // Publishing nothing would replace a working site with an empty one, so leave the last
  // good data in place and let the caller fail loudly with the reasons in hand.
  const write =
    artifacts.length === 0
      ? null
      : await writeArtifacts(options.outDir, {
          artifacts,
          builtAt: options.builtAt,
          pipelineVersion: options.pipelineVersion,
          ...(options.keepVersions === undefined ? {} : { keepVersions: options.keepVersions }),
        });
  log(write ? `published ${write.fundCount} funds as ${write.dataVersion}` : "published nothing: no fund analysed");

  return {
    schemes: schemes.length,
    eligible: eligible.length,
    analysed: artifacts.length,
    trimmed,
    funnel,
    failures,
    write,
    elapsedMs: Date.now() - started,
  };
}

/** Cached rows plus a refetched tail, or a whole history when there's nothing to build on. */
async function rowsFor(scheme: SchemeSummary, options: PipelineOptions): Promise<RawNavRow[] | null> {
  const { cacheDir, source, full } = options;
  if (!cacheDir) return source.history(scheme.code);

  // A full refresh refetches whole histories but still fills the cache, so the next nightly
  // run has something to build a tail onto.
  const cached = full ? null : await readEntry(cacheDir, scheme.code);
  if (!cached) {
    const fresh = await source.history(scheme.code);
    if (fresh?.length) {
      await writeEntry(cacheDir, { code: scheme.code, latestDate: fresh[0]?.date ?? "", rows: fresh });
    }
    return fresh;
  }

  // The cache key is the latest NAV date: unchanged means nothing to fetch.
  const newest = cached.rows[0]?.date;
  if (newest && scheme.latestNavDate !== null && newest === cached.latestDate) {
    const upstreamUnchanged = cached.latestDate === formatForCompare(scheme.latestNavDate);
    if (upstreamUnchanged) return cached.rows;
  }

  const since = Math.max(0, (scheme.latestNavDate ?? options.today) - TAIL_DAYS);
  const tail = await source.history(scheme.code, since);
  if (tail === null) return null;

  const merged = mergeRows(cached.rows, tail);
  const rows = merged.conflict ? ((await source.history(scheme.code)) ?? merged.rows) : merged.rows;
  await writeEntry(cacheDir, { code: scheme.code, latestDate: rows[0]?.date ?? cached.latestDate, rows });
  return rows;
}

function formatForCompare(day: DayNum): string {
  const date = new Date(day * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`;
}
