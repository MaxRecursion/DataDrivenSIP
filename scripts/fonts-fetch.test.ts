import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { download, ensureFont, sha256, type Fetcher, type FontPin } from "./fonts-fetch";

const body = new TextEncoder().encode("woff2 bytes");
const pin: FontPin = { file: "font.woff2", url: "https://example.test/font.woff2", sha256: sha256(body), bytes: body.length };

function fakeFetcher(statuses: number[]): { fetcher: Fetcher; calls: () => number } {
  let calls = 0;
  const fetcher: Fetcher = async () => {
    const status = statuses[Math.min(calls, statuses.length - 1)] ?? 200;
    calls++;
    return new Response(status === 200 ? body : null, { status });
  };
  return { fetcher, calls: () => calls };
}

describe("sha256", () => {
  it("matches the known digest of empty input", () => {
    expect(sha256(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("download", () => {
  it("retries server errors and 429, then succeeds", async () => {
    const { fetcher, calls } = fakeFetcher([503, 429, 200]);
    await expect(download(pin.url, fetcher, 3, 0)).resolves.toEqual(body);
    expect(calls()).toBe(3);
  });

  it("doesn't retry a 404", async () => {
    const { fetcher, calls } = fakeFetcher([404]);
    await expect(download(pin.url, fetcher, 3, 0)).rejects.toThrow("HTTP 404");
    expect(calls()).toBe(1);
  });

  it("gives up after 3 retries", async () => {
    const { fetcher, calls } = fakeFetcher([500]);
    await expect(download(pin.url, fetcher, 3, 0)).rejects.toThrow("HTTP 500");
    expect(calls()).toBe(4);
  });
});

describe("ensureFont", () => {
  it("downloads a missing font and writes it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fonts-"));
    await expect(ensureFont(pin, directory, fakeFetcher([200]).fetcher, 0)).resolves.toBe("downloaded");
    expect(readFileSync(join(directory, pin.file))).toEqual(Buffer.from(body));
  });

  it("keeps a cached font whose hash matches, without fetching", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fonts-"));
    writeFileSync(join(directory, pin.file), body);
    const { fetcher, calls } = fakeFetcher([200]);
    await expect(ensureFont(pin, directory, fetcher, 0)).resolves.toBe("cached");
    expect(calls()).toBe(0);
  });

  it("refuses a file whose hash doesn't match the pin", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fonts-"));
    const wrongPin = { ...pin, sha256: "0".repeat(64) };
    await expect(ensureFont(wrongPin, directory, fakeFetcher([200]).fetcher, 0)).rejects.toThrow("upstream file changed");
  });
});
