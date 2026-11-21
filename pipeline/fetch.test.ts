import { describe, expect, it } from "vitest";
import { fetchJson, pool, retryAfterMs } from "./fetch";

const respond = (status: number, body: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("pool", () => {
  it("keeps results in the order of the input", async () => {
    const results = await pool([5, 1, 3], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 2;
    });
    expect(results).toEqual([10, 2, 6]);
  });

  it("never runs more than the given concurrency at once", async () => {
    let running = 0;
    let peak = 0;
    await pool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("passes the index through", async () => {
    expect(await pool(["a", "b"], 1, async (item, index) => `${index}${item}`)).toEqual(["0a", "1b"]);
  });

  it("rejects when a worker throws, rather than hiding it", async () => {
    await expect(
      pool([1, 2], 2, async (value) => {
        if (value === 2) throw new Error("boom");
        return value;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("fetchJson", () => {
  const fetcherFor = (statuses: number[], body: unknown = { ok: true }) => {
    let calls = 0;
    const fetcher = async () => {
      const status = statuses[Math.min(calls, statuses.length - 1)] ?? 200;
      calls++;
      if (status === 0) throw new Error("network down");
      return respond(status, body);
    };
    return { fetcher, calls: () => calls };
  };

  it("returns the parsed body on success", async () => {
    const { fetcher } = fetcherFor([200], { hello: "world" });
    const result = await fetchJson<{ hello: string }>("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: true, value: { hello: "world" } });
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const { fetcher, calls } = fetcherFor([429, 503, 200]);
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result.ok).toBe(true);
    expect(calls()).toBe(3);
  });

  it("retries network errors", async () => {
    const { fetcher, calls } = fetcherFor([0, 200]);
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result.ok).toBe(true);
    expect(calls()).toBe(2);
  });

  it("gives up after five retries", async () => {
    const { fetcher, calls } = fetcherFor([500]);
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: false, reason: "http-error" });
    expect(calls()).toBe(6);
  });

  it("backs off exponentially from one second, capped", async () => {
    const waits: number[] = [];
    const { fetcher } = fetcherFor([503]);
    await fetchJson("https://example.test", {
      fetcher,
      maxDelayMs: 10_000,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toEqual([1000, 2000, 4000, 8000, 10_000]);
  });

  it("waits as long as Retry-After asks, when that is longer than the backoff", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls === 1) return new Response("{}", { status: 429, headers: { "retry-after": "7" } });
      return respond(200, { ok: true });
    };
    const result = await fetchJson("https://example.test", { fetcher, sleep: async (ms) => void waits.push(ms) });
    expect(result.ok).toBe(true);
    expect(waits).toEqual([7000]);
  });

  it("never waits longer than the cap, whatever Retry-After says", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls === 1) return new Response("{}", { status: 429, headers: { "retry-after": "3600" } });
      return respond(200, { ok: true });
    };
    await fetchJson("https://example.test", { fetcher, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([30_000]);
  });

  it("doesn't retry a 404", async () => {
    const { fetcher, calls } = fetcherFor([404]);
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(calls()).toBe(1);
  });

  it("retries malformed success responses, then returns the complete JSON", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      if (calls === 1) return new Response("<html>temporarily unavailable</html>", { status: 200 });
      if (calls === 2) return new Response('{"data": [', { status: 200 });
      return respond(200, { data: [1, 2] });
    };
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: true, value: { data: [1, 2] } });
    expect(calls).toBe(3);
  });

  it("treats unparseable JSON as a failure rather than throwing", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return new Response("<html>oops</html>", { status: 200 });
    };
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: false, reason: "bad-body" });
    expect(calls).toBe(6);
  });
});

describe("retryAfterMs", () => {
  const now = Date.parse("2026-11-21T07:30:00Z");

  it("reads whole seconds", () => {
    expect(retryAfterMs("12", now)).toBe(12_000);
  });

  it("reads an HTTP date, relative to now", () => {
    expect(retryAfterMs("Sat, 21 Nov 2026 07:30:05 GMT", now)).toBe(5000);
  });

  it("never returns a negative wait for a date in the past", () => {
    expect(retryAfterMs("Sat, 21 Nov 2026 07:29:00 GMT", now)).toBe(0);
  });

  it("ignores a missing or unreadable header", () => {
    expect(retryAfterMs(null, now)).toBeNull();
    expect(retryAfterMs("soon", now)).toBeNull();
  });
});
