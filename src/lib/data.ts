/**
 * Fetching the precomputed data (spec §3, PLAN.md D20).
 *
 * Fund files live under a path carrying the data version, so a URL is asked for once per
 * build and can be cached hard. Workers answers an unknown data path with the app shell and
 * a 200, so anything that isn't JSON means "not covered" rather than an error.
 */
import type { FundArtifact, IndexRow, Meta, Trending } from "../../shared/artifacts";

export type FundResult = { ok: true; fund: FundArtifact } | { ok: false; reason: "not-covered" | "unavailable" };

let version: string | null = null;
let versionRequest: Promise<string | null> | null = null;
let indexRequest: Promise<IndexRow[]> | null = null;
const funds = new Map<number, Promise<FundResult>>();
const seeded = new Map<number, FundArtifact>();

/** The build stamps the version into the page, so a cold load needs no extra request. */
function versionFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[name="data-version"]')?.getAttribute("content") ?? null;
}

export function setDataVersion(value: string | null): void {
  version = value;
}

export async function dataVersion(fetcher: typeof fetch = fetch): Promise<string | null> {
  if (version) return version;
  version = versionFromDocument();
  if (version) return version;

  // Only in development, where the page wasn't prerendered.
  versionRequest ??= (async () => {
    try {
      const response = await fetcher("/data/meta.json");
      if (!isJson(response)) return null;
      return ((await response.json()) as Meta).dataVersion ?? null;
    } catch {
      return null;
    }
  })();
  version = await versionRequest;
  return version;
}

function isJson(response: Response): boolean {
  return response.ok && (response.headers.get("content-type") ?? "").includes("application/json");
}

export function loadFund(code: number, fetcher: typeof fetch = fetch): Promise<FundResult> {
  const pending = funds.get(code);
  if (pending) return pending;

  const request = (async (): Promise<FundResult> => {
    try {
      const at = await dataVersion(fetcher);
      if (!at) return { ok: false, reason: "unavailable" };
      const response = await fetcher(`/data/${at}/funds/${code}.json`);
      if (!isJson(response)) return { ok: false, reason: "not-covered" };
      return { ok: true, fund: (await response.json()) as FundArtifact };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  })();

  funds.set(code, request);
  return request;
}

/** The page carries its own fund's data, so a deep link needs no request at all. */
export function seedFund(fund: FundArtifact): void {
  seeded.set(fund.code, fund);
  funds.set(fund.code, Promise.resolve({ ok: true, fund }));
}

/**
 * Synchronous on purpose: the prerender and the browser's first render both read the seeded
 * fund while rendering, so the markup they produce is identical and hydration holds.
 */
export function peekFund(code: number): FundArtifact | undefined {
  return seeded.get(code);
}

/** Warms the cache for the hit the reader is about to choose. */
export function prefetchFund(code: number, fetcher: typeof fetch = fetch): void {
  void loadFund(code, fetcher);
}

/** Loaded on the first keystroke, never on page load (spec §9). */
export function loadIndex(fetcher: typeof fetch = fetch): Promise<IndexRow[]> {
  indexRequest ??= (async () => {
    try {
      const response = await fetcher("/data/index.json");
      if (!isJson(response)) return [];
      return (await response.json()) as IndexRow[];
    } catch {
      return [];
    }
  })();
  return indexRequest;
}

let trendingRequest: Promise<Trending | null> | null = null;

/**
 * The funds whose NAV rose most over the past month (pipeline/analysis/momentum.ts). Loaded
 * the first time a reader opens the empty search box, never on page load. Null when the file
 * is missing or isn't JSON — a missing file answers with the app shell and a 200 (PLAN.md D20).
 */
export function loadTrending(fetcher: typeof fetch = fetch): Promise<Trending | null> {
  trendingRequest ??= (async () => {
    try {
      const response = await fetcher("/data/trending.json");
      if (!isJson(response)) return null;
      const trending = (await response.json()) as Trending;
      return Array.isArray(trending.funds) ? trending : null;
    } catch {
      return null;
    }
  })();
  return trendingRequest;
}

/** Tests only. */
export function resetDataCache(): void {
  version = null;
  versionRequest = null;
  indexRequest = null;
  trendingRequest = null;
  funds.clear();
  seeded.clear();
}
