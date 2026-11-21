/**
 * The cache key is the latest NAV date (spec §4.3): unchanged means nothing to fetch, and a
 * newer date means only the tail is fetched and merged.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dayFromIso, dayFromNavDate, isoFromDay } from "./analysis/dates";
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

/** Honours `since` the way the real source does, so a tail fetch really is only a tail. */
function countingSource(scheme: SchemeSummary, rows: RawNavRow[]) {
  const calls: { code: number; since: number | undefined }[] = [];
  const source: NavSource = {
    listSchemes: async () => [scheme],
    history: async (code, since) => {
      calls.push({ code, since });
      if (since === undefined) return rows;
      return rows.filter((row) => dayFromNavDate(row.date) >= since);
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

  it("refetches the whole history when the cache is staler than the tail window", async () => {
    // A tail reaching back only from the newest day upstream would leave the days between
    // permanently missing from the cached history.
    const { scheme, rows } = await kotakFixture();
    const newestDay = scheme.latestNavDate;
    if (newestDay === null) throw new Error("fixture has no date");
    const cacheDir = mkdtempSync(join(tmpdir(), "sip-cache-run-"));
    const stale = rows.filter((row) => dayFromNavDate(row.date) <= newestDay - 40);
    const staleNewest = stale[0];
    if (!staleNewest) throw new Error("fixture too short");
    await writeEntry(cacheDir, { code: scheme.code, latestDate: staleNewest.date, rows: stale });

    const { source, calls } = countingSource(scheme, rows);
    const report = await runPipeline({
      source,
      outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
      cacheDir,
      ...options,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.since).toBeUndefined();
    const written = await readEntry(cacheDir, scheme.code);
    expect(written?.rows).toHaveLength(rows.length);
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

  describe("when upstream fails after every retry", () => {
    /** A source whose list works but whose every history request fails, as on 2026-11-21. */
    function failingSource(scheme: SchemeSummary) {
      const calls: (number | undefined)[] = [];
      const source: NavSource = {
        listSchemes: async () => [scheme],
        history: async (_code, since) => {
          calls.push(since);
          throw new Error("http-error");
        },
      };
      return { source, calls };
    }

    async function cachedKotak(staleByDays: number) {
      const { scheme, rows } = await kotakFixture();
      const newestDay = scheme.latestNavDate;
      if (newestDay === null) throw new Error("fixture has no date");
      const cacheDir = mkdtempSync(join(tmpdir(), "sip-cache-run-"));
      const cachedRows = rows.filter((row) => dayFromNavDate(row.date) <= newestDay - staleByDays);
      const cachedNewest = cachedRows[0];
      if (!cachedNewest) throw new Error("fixture too short");
      await writeEntry(cacheDir, { code: scheme.code, latestDate: cachedNewest.date, rows: cachedRows });
      return { scheme, cacheDir, cachedRows };
    }

    it("publishes the fund from its cached history when the tail fetch fails", async () => {
      const { scheme, cacheDir, cachedRows } = await cachedKotak(3);
      const { source, calls } = failingSource(scheme);
      const report = await runPipeline({
        source,
        outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
        cacheDir,
        ...options,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toBeDefined();
      expect(report.failures).toEqual([]);
      expect(report.analysed).toBe(1);
      expect(report.fromCache).toEqual([scheme.code]);
      // The cache is left as it was, so tomorrow's tail still joins it.
      expect((await readEntry(cacheDir, scheme.code))?.rows).toHaveLength(cachedRows.length);
    });

    it("publishes from the cache when a whole-history refetch fails", async () => {
      const { scheme, cacheDir } = await cachedKotak(40);
      const { source, calls } = failingSource(scheme);
      const report = await runPipeline({
        source,
        outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
        cacheDir,
        ...options,
      });

      expect(calls).toEqual([undefined]);
      expect(report.analysed).toBe(1);
      expect(report.fromCache).toEqual([scheme.code]);
    });

    it("dates the fallback by its last cached NAV, not by the run", async () => {
      const { scheme, cacheDir, cachedRows } = await cachedKotak(3);
      const outDir = mkdtempSync(join(tmpdir(), "sip-data-"));
      await runPipeline({
        source: failingSource(scheme).source,
        outDir,
        cacheDir,
        ...options,
      });

      const meta = JSON.parse(readFileSync(join(outDir, "meta.json"), "utf8")) as { navAsOf: string };
      const newest = cachedRows[0];
      if (!newest) throw new Error("fixture has no rows");
      expect(meta.navAsOf).toBe(isoFromDay(dayFromNavDate(newest.date)));
    });

    it("still counts the fund as a failure when nothing is cached", async () => {
      const { scheme } = await kotakFixture();
      const report = await runPipeline({
        source: failingSource(scheme).source,
        outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
        cacheDir: mkdtempSync(join(tmpdir(), "sip-cache-run-")),
        ...options,
      });

      expect(report.analysed).toBe(0);
      expect(report.fromCache).toEqual([]);
      expect(report.failures).toEqual([{ code: scheme.code, reason: "http-error" }]);
    });

    it("falls back on a full refresh too, without building on the cache otherwise", async () => {
      const { scheme, cacheDir } = await cachedKotak(0);
      const { source, calls } = failingSource(scheme);
      const report = await runPipeline({
        source,
        outDir: mkdtempSync(join(tmpdir(), "sip-data-")),
        cacheDir,
        full: true,
        ...options,
      });

      expect(calls).toEqual([undefined]);
      expect(report.analysed).toBe(1);
      expect(report.fromCache).toEqual([scheme.code]);
    });
  });
});
