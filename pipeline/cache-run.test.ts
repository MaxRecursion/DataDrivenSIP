/**
 * The cache key is the latest NAV date (spec §4.3): unchanged means nothing to fetch, and a
 * newer date means only the tail is fetched and merged.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dayFromIso } from "./analysis/dates";
import { readEntry, writeEntry } from "./cache";
import { runPipeline } from "./run";
import { fixtureSource } from "./sources/fixture";
import type { NavSource, RawNavRow, SchemeSummary } from "./sources/types";

const options = {
  today: dayFromIso("2026-09-16"),
  asOf: dayFromIso("2026-09-11"),
  builtAt: "2026-09-16T00:30:00.000Z",
  pipelineVersion: "1.0.0",
  log: () => {},
};

async function kotakFixture(): Promise<{ scheme: SchemeSummary; rows: RawNavRow[] }> {
  const fixtures = fixtureSource();
  const scheme = (await fixtures.listSchemes()).find((entry) => entry.code === 119775);
  const rows = await fixtures.history(119775);
  if (!scheme || !rows) throw new Error("fixture missing");
  return { scheme, rows };
}

function countingSource(scheme: SchemeSummary, rows: RawNavRow[]) {
  const calls: { code: number; since: number | undefined }[] = [];
  const source: NavSource = {
    listSchemes: async () => [scheme],
    history: async (code, since) => {
      calls.push({ code, since });
      return rows;
    },
  };
  return { source, calls };
}

describe("runPipeline with a cache", () => {
  it("doesn't fetch at all when the latest NAV date is the one already cached", async () => {
    const { scheme, rows } = await kotakFixture();
    const cacheDir = mkdtempSync(join(tmpdir(), "sip-cache-run-"));
    const newest = rows[0];
    if (!newest) throw new Error("fixture has no rows");
    await writeEntry(cacheDir, { code: scheme.code, latestDate: newest.date, rows });

    const { source, calls } = countingSource(scheme, rows);
    const report = await runPipeline({
      source,
      outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
      cacheDir,
      ...options,
    });

    expect(calls).toEqual([]);
    expect(report.analysed).toBe(1);
  });

  it("fetches only the tail when upstream has a newer NAV", async () => {
    const { scheme, rows } = await kotakFixture();
    const cacheDir = mkdtempSync(join(tmpdir(), "sip-cache-run-"));
    const newest = rows[0];
    if (!newest || scheme.latestNavDate === null) throw new Error("fixture has no rows");
    await writeEntry(cacheDir, { code: scheme.code, latestDate: newest.date, rows });

    // Upstream published another day since the cache was written.
    const moved: SchemeSummary = { ...scheme, latestNavDate: scheme.latestNavDate + 1 };
    const { source, calls } = countingSource(moved, rows);
    const report = await runPipeline({
      source,
      outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
      cacheDir,
      ...options,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.since).toBeDefined();
    expect(calls[0]?.since).toBeLessThan(moved.latestNavDate ?? 0);
    expect(report.analysed).toBe(1);
  });

  it("still fills the cache on a full refresh, so the next run isn't cold", async () => {
    const { scheme, rows } = await kotakFixture();
    const cacheDir = mkdtempSync(join(tmpdir(), "sip-cache-run-"));
    const { source, calls } = countingSource(scheme, rows);

    await runPipeline({
      source,
      outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
      cacheDir,
      full: true,
      ...options,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.since).toBeUndefined();
    expect(await readEntry(cacheDir, scheme.code)).not.toBeNull();
  });

  it("fetches the whole history when nothing is cached, and caches it", async () => {
    const { scheme, rows } = await kotakFixture();
    const cacheDir = mkdtempSync(join(tmpdir(), "sip-cache-run-"));
    const { source, calls } = countingSource(scheme, rows);

    const first = await runPipeline({
      source,
      outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
      cacheDir,
      ...options,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.since).toBeUndefined();
    expect(first.analysed).toBe(1);

    // Second run over the same cache: the date hasn't moved, so no further fetch.
    const second = await runPipeline({
      source,
      outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
      cacheDir,
      ...options,
    });
    expect(calls).toHaveLength(1);
    expect(second.analysed).toBe(1);
  });
});
