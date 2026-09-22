import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FundArtifact, IndexRow, Meta, Trending } from "../shared/artifacts";
import { dayFromIso } from "./analysis/dates";
import { writeArtifacts } from "./write";

const kotak = JSON.parse(
  readFileSync(new URL("./fixtures/expected/kotak-full.json", import.meta.url), "utf8"),
) as FundArtifact;
const quant = JSON.parse(
  readFileSync(new URL("./fixtures/expected/quant-40m.json", import.meta.url), "utf8"),
) as FundArtifact;

const out = () => mkdtempSync(join(tmpdir(), "sip-data-"));
const options = {
  builtAt: "2026-09-16T00:30:00.000Z",
  pipelineVersion: "1.0.0",
};

describe("writeArtifacts", () => {
  it("writes fund files under a versioned directory, with index and meta at stable paths", async () => {
    const dir = out();
    const result = await writeArtifacts(dir, { artifacts: [quant, kotak], ...options });

    expect(existsSync(join(dir, result.dataVersion, "funds", "119775.json"))).toBe(true);
    expect(existsSync(join(dir, result.dataVersion, "funds", "151713.json"))).toBe(true);

    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Meta;
    expect(meta.dataVersion).toBe(result.dataVersion);
    expect(meta.fundCount).toBe(2);
    expect(meta.navAsOf).toBe("2026-09-11");
    expect(meta.builtAt).toBe(options.builtAt);
    expect(meta.source).toBe("mfapi.in");
  });

  it("orders the index by scheme code, never by any metric", async () => {
    const dir = out();
    await writeArtifacts(dir, { artifacts: [kotak, quant], ...options });
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as IndexRow[];
    expect(index.map((row) => row[0])).toEqual([119775, 151713]);
    expect(index[0]).toEqual([
      kotak.code,
      kotak.name,
      kotak.house,
      kotak.category,
      kotak.verdict,
      kotak.spreadPp,
    ]);
  });

  it("writes the fund data before index and meta, so a half-finished run is never pointed at", async () => {
    const dir = out();
    const result = await writeArtifacts(dir, { artifacts: [kotak], ...options });
    const fund = JSON.parse(
      readFileSync(join(dir, result.dataVersion, "funds", "119775.json"), "utf8"),
    ) as FundArtifact;
    expect(fund).toEqual(kotak);
  });

  it("gives a different data version when the artifacts change", async () => {
    const first = await writeArtifacts(out(), { artifacts: [kotak], ...options });
    const second = await writeArtifacts(out(), { artifacts: [{ ...kotak, spreadPp: 0.2 }], ...options });
    expect(first.dataVersion).not.toBe(second.dataVersion);
    expect(first.dataVersion.startsWith("2026-09-11.")).toBe(true);
  });

  it("keeps the newest versions, counting the one just written, and prunes the rest", async () => {
    const dir = out();
    for (const stale of ["2026-09-01.aaaaaaaa", "2026-09-02.bbbbbbbb", "2026-09-03.cccccccc"]) {
      mkdirSync(join(dir, stale, "funds"), { recursive: true });
      writeFileSync(join(dir, stale, "funds", "1.json"), "{}");
    }
    const result = await writeArtifacts(dir, { artifacts: [kotak], ...options, keepVersions: 2 });

    const versions = readdirSync(dir).filter((entry) => /^\d{4}-\d{2}-\d{2}\./.test(entry)).sort();
    expect(versions).toHaveLength(2);
    expect(versions).toContain(result.dataVersion);
    expect(versions).toContain("2026-09-03.cccccccc");
  });

  it("refuses to write an artifact that fails validation", async () => {
    const broken = { ...kotak, verdict: "excellent" } as unknown as FundArtifact;
    await expect(writeArtifacts(out(), { artifacts: [broken], ...options })).rejects.toThrow(/valid/i);
  });
});

describe("trending.json", () => {
  it("ranks published funds priced on navAsOf by their month's change, and names them", async () => {
    const dir = out();
    const navAsOf = kotak.navTo;
    const today = dayFromIso(navAsOf);
    await writeArtifacts(dir, {
      artifacts: [quant, kotak],
      ...options,
      momentum: [
        { code: 151713, lastDay: today, monthPct: 1.5 },
        { code: 119775, lastDay: today, monthPct: 4.25 },
        // Not a published fund, so it can't appear however large its number.
        { code: 999999, lastDay: today, monthPct: 80 },
      ],
    });

    const trending = JSON.parse(readFileSync(join(dir, "trending.json"), "utf8")) as Trending;
    expect(trending.basis).toBe("NAV change over the past month");
    expect(trending.funds.map((row) => row.code)).toEqual(
      quant.navTo === navAsOf ? [119775, 151713] : [119775],
    );
    expect(trending.funds[0]).toEqual({ code: 119775, name: kotak.name, house: kotak.house, monthPct: 4.25 });
  });

  it("writes no trending.json when no momentum was measured", async () => {
    const dir = out();
    await writeArtifacts(dir, { artifacts: [kotak], ...options });
    expect(existsSync(join(dir, "trending.json"))).toBe(false);
  });
});
