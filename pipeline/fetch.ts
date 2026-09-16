/**
 * HTTP with a concurrency pool and bounded retries (spec §4.3). Failures come back as values
 * rather than exceptions, so one bad scheme never takes down a run.
 */

export type FetchFailure = "not-found" | "http-error" | "network" | "bad-body";
export type FetchResult<T> = { ok: true; value: T } | { ok: false; reason: FetchFailure };

export type FetchOptions = {
  retries?: number;
  baseDelayMs?: number;
  fetcher?: typeof fetch;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries 429, 5xx and network errors with exponential backoff; other statuses fail at once. */
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<FetchResult<T>> {
  const { retries = 3, baseDelayMs = 500, fetcher = fetch } = options;
  let lastReason: FetchFailure = "network";

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      const response = await fetcher(url);
      if (response.ok) {
        try {
          return { ok: true, value: (await response.json()) as T };
        } catch {
          return { ok: false, reason: "bad-body" };
        }
      }
      if (response.status === 404) return { ok: false, reason: "not-found" };
      lastReason = "http-error";
      if (response.status !== 429 && response.status < 500) return { ok: false, reason: "http-error" };
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
