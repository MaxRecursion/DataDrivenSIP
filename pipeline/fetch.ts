/**
 * HTTP with a concurrency pool and bounded retries (spec §4.3). Failures come back as values
 * rather than exceptions, so one bad scheme never takes down a run.
 */

export type FetchFailure = "not-found" | "http-error" | "network" | "bad-body";
export type FetchResult<T> = { ok: true; value: T } | { ok: false; reason: FetchFailure };

export type FetchOptions = {
  retries?: number;
  baseDelayMs?: number;
  /** No single wait, backoff or `Retry-After`, is longer than this. */
  maxDelayMs?: number;
  fetcher?: typeof fetch;
  /** Injected so tests can see the waits without spending them. */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The wait a 429 or 503 asks for, in milliseconds, or null when it asks for none we can read.
 * `Retry-After` is either whole seconds or an HTTP date.
 */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/**
 * Retries 429, 5xx, network errors and malformed JSON with bounded exponential backoff,
 * waiting at least as long as a `Retry-After` header asks.
 *
 * Five retries from one second reach about 31 s of waiting before giving up. Three from half a
 * second (3.5 s) was too short for mfapi's throttling: on 2026-11-21 it cost 178 funds.
 */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<FetchResult<T>> {
  const { retries = 5, baseDelayMs = 1000, maxDelayMs = 30_000, fetcher = fetch, sleep = realSleep } = options;
  let lastReason: FetchFailure = "network";
  let askedMs: number | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.min(maxDelayMs, Math.max(backoff, askedMs ?? 0)));
    }
    askedMs = null;
    try {
      const response = await fetcher(url);
      if (response.ok) {
        try {
          return { ok: true, value: (await response.json()) as T };
        } catch {
          // mfapi sometimes returns an incomplete/non-JSON body with HTTP 200. Treat it
          // like a transient transport failure so one bad response doesn't drop a fund.
          lastReason = "bad-body";
          continue;
        }
      }
      if (response.status === 404) return { ok: false, reason: "not-found" };
      lastReason = "http-error";
      if (response.status !== 429 && response.status < 500) return { ok: false, reason: "http-error" };
      askedMs = retryAfterMs(response.headers.get("retry-after"), Date.now());
    } catch {
      lastReason = "network";
    }
  }
  return { ok: false, reason: lastReason };
}

/** Runs `worker` over `items` with at most `concurrency` in flight, preserving input order. */
export async function pool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index] as T;
      results[index] = await worker(item, index);
    }
  };

  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, run);
  await Promise.all(lanes);
  return results;
}
