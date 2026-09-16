import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeRows, readEntry, writeEntry } from "./cache";

const rows = (entries: [string, string][]) => entries.map(([date, nav]) => ({ date, nav }));
const dir = () => mkdtempSync(join(tmpdir(), "sip-cache-"));

describe("mergeRows", () => {
  // Upstream returns newest first, and a windowed fetch overlaps the cached tail.
  const cached = rows([
    ["11-09-2026", "169.773"],
    ["10-09-2026", "170.526"],
    ["09-09-2026", "170.878"],
  ]);

  it("adds the new days and keeps newest first", () => {
    const fresh = rows([
      ["15-09-2026", "165.887"],
      ["14-09-2026", "166.100"],
      ["11-09-2026", "169.773"],
    ]);
    const merged = mergeRows(cached, fresh);
    expect(merged.conflict).toBe(false);
    expect(merged.rows.map((row) => row.date)).toEqual([
      "15-09-2026",
      "14-09-2026",
      "11-09-2026",
      "10-09-2026",
      "09-09-2026",
    ]);
  });

  it("reports a conflict when an overlapping day changed, so the caller can refetch in full", () => {
    const corrected = rows([
      ["12-09-2026", "170.000"],
      ["11-09-2026", "169.999"],
    ]);
    const merged = mergeRows(cached, corrected);
    expect(merged.conflict).toBe(true);
  });

  it("is a no-op when the fresh rows are already known", () => {
    const merged = mergeRows(cached, cached.slice(0, 2));
    expect(merged.conflict).toBe(false);
    expect(merged.rows).toEqual(cached);
  });

  it("drops a cached day the tail no longer returns, because upstream withdrew it", () => {
    const tail = rows([
      ["11-09-2026", "169.773"],
      ["09-09-2026", "170.878"],
    ]);
    const merged = mergeRows(cached, tail);
    expect(merged.rows.map((row) => row.date)).toEqual(["11-09-2026", "09-09-2026"]);
    expect(merged.conflict).toBe(false);
  });

  it("keeps cached days from outside the range the tail covers", () => {
    const tail = rows([["11-09-2026", "169.773"]]);
    const merged = mergeRows(cached, tail);
    expect(merged.rows.map((row) => row.date)).toEqual(["11-09-2026", "10-09-2026", "09-09-2026"]);
  });

  it("handles an empty cache and empty fetches", () => {
    expect(mergeRows([], cached).rows).toEqual(cached);
    expect(mergeRows(cached, []).rows).toEqual(cached);
  });
});

describe("cache entries on disk", () => {
  it("round-trips", async () => {
    const path = dir();
    const entry = { code: 119775, latestDate: "11-09-2026", rows: rows([["11-09-2026", "169.773"]]) };
    await writeEntry(path, entry);
    expect(await readEntry(path, 119775)).toEqual(entry);
  });

  it("returns null for a code that was never cached", async () => {
    expect(await readEntry(dir(), 404404)).toBeNull();
  });

  it("returns null rather than throwing on a corrupt file", async () => {
    const path = dir();
    const entry = { code: 1, latestDate: "11-09-2026", rows: [] };
    await writeEntry(path, entry);
    const file = join(path, "1.json");
    writeFileSync(file, `${readFileSync(file, "utf8").slice(0, 12)}`);
    expect(await readEntry(path, 1)).toBeNull();
  });
});
