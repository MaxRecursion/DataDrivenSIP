/**
 * Raw NAV rows cached per scheme, keyed by the latest NAV date (spec §4.3).
 *
 * When that date moves, only the tail is refetched and merged. If an overlapping day comes
 * back with a different NAV, upstream corrected history and the caller refetches in full.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dayFromNavDate } from "./analysis/dates";
import type { RawNavRow } from "./sources/types";

export type CacheEntry = {
  code: number;
  /** The newest row's date, as published (DD-MM-YYYY). */
  latestDate: string;
  /** Newest first, as upstream returns them. */
  rows: RawNavRow[];
};

export const cachePath = (dir: string, code: number) => join(dir, `${code}.json`);

export async function readEntry(dir: string, code: number): Promise<CacheEntry | null> {
  try {
    const entry = JSON.parse(await readFile(cachePath(dir, code), "utf8")) as CacheEntry;
    if (typeof entry?.latestDate !== "string" || !Array.isArray(entry.rows)) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function writeEntry(dir: string, entry: CacheEntry): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath(dir, entry.code), JSON.stringify(entry));
}

const day = (row: RawNavRow) => {
  try {
    return dayFromNavDate(row.date);
  } catch {
    return Number.NaN;
  }
};

export function mergeRows(
  cached: readonly RawNavRow[],
  fresh: readonly RawNavRow[],
): { rows: RawNavRow[]; conflict: boolean } {
  const byDate = new Map(cached.map((row) => [row.date, row]));
  let conflict = false;

  for (const row of fresh) {
    const existing = byDate.get(row.date);
    if (existing && existing.nav !== row.nav) conflict = true;
    byDate.set(row.date, row);
  }

  const rows = [...byDate.values()].sort((a, b) => day(b) - day(a));
  return { rows, conflict };
}
