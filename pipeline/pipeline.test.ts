import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FundArtifact } from "../shared/artifacts";
import { dayFromIso } from "./analysis/dates";
import { runPipeline } from "./run";
import { fixtureSource } from "./sources/fixture";

const expected = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/expected/${name}.json`, import.meta.url), "utf8")) as FundArtifact;

const options = {
  today: dayFromIso("2026-09-16"),
  asOf: dayFromIso("2026-09-11"),
  builtAt: "2026-09-16T00:30:00.000Z",
  pipelineVersion: "1.0.0",
  workers: 0, // in process, so the test stays deterministic
  log: () => {},
};

// Acceptance criterion 3 asks that the *pipeline* reproduce Kotak, not just the engine.
describe("runPipeline against the frozen fixtures", () => {
  it("reproduces the Kotak artifact exactly", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sip-pipeline-"));
    const report = await runPipeline({ source: fixtureSource(), outDir, codes: [119775], ...options });

    expect(report.failures).toEqual([]);
    expect(report.analysed).toBe(1);
    expect(report.write).not.toBeNull();
    const written = JSON.parse(
      readFileSync(join(outDir, report.write?.dataVersion ?? "", "funds", "119775.json"), "utf8"),
    ) as FundArtifact;
    expect(written).toEqual(expected("kotak-full"));
  });

  it("writes an index and meta covering both fixture funds", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sip-pipeline-"));
    const report = await runPipeline({ source: fixtureSource(), outDir, ...options });

    expect(report.analysed).toBe(2);
    expect(report.write?.fundCount).toBe(2);
    const index = JSON.parse(readFileSync(join(outDir, "index.json"), "utf8")) as [number, string, string, string][];
    expect(index.map((row) => row[0])).toEqual([119775, 151713]);
    expect(report.write?.navAsOf).toBe("2026-09-11");
  });

  it("honours --as-of by ignoring NAVs published later", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sip-pipeline-"));
    const report = await runPipeline({
      source: fixtureSource(),
      outDir,
      codes: [119775],
      ...options,
      asOf: dayFromIso("2024-01-31"),
    });
    const written = JSON.parse(
      readFileSync(join(outDir, report.write?.dataVersion ?? "", "funds", "119775.json"), "utf8"),
    ) as FundArtifact;
    expect(written.navTo <= "2024-01-31").toBe(true);
    expect(written.navTo).not.toBe("2026-09-11");
  });

  it("reports a fund it cannot analyse instead of failing the whole run", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sip-pipeline-"));
    const source = fixtureSource();
    // NAVs only on the 1st to the 5th of each month: years of smooth history, but no month
    // where all 28 dates could be invested, so the engine refuses to produce an artifact.
    const sparse: { date: string; nav: string }[] = [];
    let nav = 100;
    for (let year = 2020; year <= 2026; year++) {
      for (let month = 1; month <= 12; month++) {
        if (year === 2026 && month > 9) break;
        for (const day of [1, 2, 3, 4, 5]) {
          nav *= 1.001;
          sparse.push({
            date: `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`,
            nav: nav.toFixed(4),
          });
        }
      }
    }
    sparse.reverse();

    const broken = {
      ...source,
      history: async (code: number) => (code === 119775 ? sparse : source.history(code)),
    };
    const report = await runPipeline({ source: broken, outDir, codes: [119775], ...options });
    expect(report.analysed).toBe(0);
    expect(report.failures[0]?.code).toBe(119775);
    expect(report.failures[0]?.reason).toBeTruthy();
    // Nothing analysable means nothing published: the last good data stays up.
    expect(report.write).toBeNull();
  });

  it("counts every scheme it drops, with a reason", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sip-pipeline-"));
    const report = await runPipeline({ source: fixtureSource(), outDir, ...options });
    const dropped = [...report.funnel.values()].reduce((sum, count) => sum + count, 0);
    expect(dropped + report.eligible).toBe(report.schemes);
  });
});
