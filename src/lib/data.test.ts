import { beforeEach, describe, expect, it } from "vitest";
import kotakFixture from "../../pipeline/fixtures/expected/kotak-full.json";
import type { FundArtifact } from "../../shared/artifacts";
import { loadFund, loadIndex, peekFund, resetDataCache, seedFund, setDataVersion } from "./data";

const kotak = kotakFixture as unknown as FundArtifact;

const VERSION = "2026-09-15.05a1124c";

function fakeFetch(routes: Record<string, { body: string; status?: number; type?: string }>) {
  const asked: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const route = routes[url];
    if (!route) return new Response("<!doctype html><div id=root></div>", { status: 200, headers: { "content-type": "text/html" } });
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: { "content-type": route.type ?? "application/json" },
    });
  }) as typeof fetch;
  return { fetcher, asked };
}

beforeEach(() => {
  resetDataCache();
  setDataVersion(VERSION);
});

describe("loadFund", () => {
  it("reads the fund from the versioned path", async () => {
    const { fetcher, asked } = fakeFetch({
      [`/data/${VERSION}/funds/119775.json`]: { body: JSON.stringify(kotak) },
    });
    const result = await loadFund(119775, fetcher);
    expect(result).toEqual({ ok: true, fund: kotak });
    expect(asked).toEqual([`/data/${VERSION}/funds/119775.json`]);
  });

  it("treats the app shell as 'not covered', which is what a missing file returns", async () => {
    // Workers answers an unknown data path with index.html and a 200 (PLAN.md D20).
    const { fetcher } = fakeFetch({});
    expect(await loadFund(999999, fetcher)).toEqual({ ok: false, reason: "not-covered" });
  });

  it("treats a 404 as not covered", async () => {
    const { fetcher } = fakeFetch({
      [`/data/${VERSION}/funds/1.json`]: { body: "nope", status: 404, type: "text/plain" },
    });
    expect(await loadFund(1, fetcher)).toEqual({ ok: false, reason: "not-covered" });
  });

  it("reports a network failure separately, because retrying makes sense there", async () => {
    const fetcher = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await loadFund(119775, fetcher)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks once per fund, however many callers want it", async () => {
    const { fetcher, asked } = fakeFetch({
      [`/data/${VERSION}/funds/119775.json`]: { body: JSON.stringify(kotak) },
    });
    await Promise.all([loadFund(119775, fetcher), loadFund(119775, fetcher)]);
    await loadFund(119775, fetcher);
    expect(asked).toHaveLength(1);
  });
});

describe("the fund inlined into the page", () => {
  it("is readable while rendering, which is what lets the prerender and the browser agree", () => {
    expect(peekFund(kotak.code)).toBeUndefined();
    seedFund(kotak);
    // Synchronous: an effect or a promise would leave the prerendered markup empty.
    expect(peekFund(kotak.code)).toBe(kotak);
  });

  it("is served from the page rather than fetched again", async () => {
    const { fetcher, asked } = fakeFetch({});
    seedFund(kotak);
    expect(await loadFund(kotak.code, fetcher)).toEqual({ ok: true, fund: kotak });
    expect(asked).toEqual([]);
  });
});

describe("loadIndex", () => {
  const index = JSON.stringify([[119775, "Kotak Mid Cap Fund", "Kotak", "Equity"]]);

  it("fetches the index once and keeps it", async () => {
    const { fetcher, asked } = fakeFetch({ "/data/index.json": { body: index } });
    await loadIndex(fetcher);
    await loadIndex(fetcher);
    expect(asked).toEqual(["/data/index.json"]);
  });

  it("returns an empty list rather than throwing when it can't be read", async () => {
    const fetcher = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await loadIndex(fetcher)).toEqual([]);
  });
});
