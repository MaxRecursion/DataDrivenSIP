import { describe, expect, it } from "vitest";
import { fetchJson, pool } from "./fetch";

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

  it("gives up after three retries", async () => {
    const { fetcher, calls } = fetcherFor([500]);
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: false, reason: "http-error" });
    expect(calls()).toBe(4);
  });

  it("doesn't retry a 404", async () => {
    const { fetcher, calls } = fetcherFor([404]);
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(calls()).toBe(1);
  });

  it("treats unparseable JSON as a failure rather than throwing", async () => {
    const fetcher = async () => new Response("<html>oops</html>", { status: 200 });
    const result = await fetchJson("https://example.test", { fetcher, baseDelayMs: 0 });
    expect(result).toEqual({ ok: false, reason: "bad-body" });
  });
});
