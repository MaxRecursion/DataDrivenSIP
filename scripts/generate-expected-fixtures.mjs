/**
 * Regenerates pipeline/fixtures/expected/*.json — the golden artifacts the engine is tested
 * against. Run with `node scripts/generate-expected-fixtures.mjs`.
 *
 * The numbers come from the Phase 0 reference harness
 * (docs/research/phase-0/fixtures/criterion-3-reference-harness.mjs), NOT from
 * pipeline/analysis. That harness is the implementation whose conventions reproduce the
 * user's acceptance criterion 3, and a second agent reimplemented it independently and
 * confirmed all 28 rows (docs/research/phase-0/02-criterion-3-independent-check.md).
 *
 * This script loads the harness's functions by cutting the file at its `main` section, so a
 * reviewer can rerun it and see that the expected files are not self-generated.
 *
 * Per PLAN.md D1, two runs are merged: the per-date month rule supplies xirr, meanPct, topQ,
 * w and stability; the common month set supplies corpus, spreadRupees, metricsAgree and
 * instalments.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const harnessPath = join(root, "docs/research/phase-0/fixtures/criterion-3-reference-harness.mjs");
const CUTOFF = "2026-09-11";

const cases = [
  { out: "kotak-full", file: "119775.nav.json" },
  { out: "quant-40m", file: "151713.nav.json" },
  { out: "kotak-40m", file: "119775.nav.json", months: 40 },
  { out: "kotak-37m", file: "119775.nav.json", months: 37 },
  { out: "kotak-36m", file: "119775.nav.json", months: 36 },
];

// The harness runs its own report on import, so take everything above that and add exports.
const libPath = join(root, "node_modules/.tmp/reference-harness-lib.mjs");
const harness = readFileSync(harnessPath, "utf8");
const body = harness.slice(0, harness.search(/^\/\/ =+ main =+/m));
mkdirSync(dirname(libPath), { recursive: true });
writeFileSync(libPath, `${body}\nexport { parse, hist, analyse, BEST, dayOf, iso, argmax };\n`);
const { parse, hist, analyse, BEST, dayOf, iso, argmax } = await import(pathToFileURL(libPath).href);

const minusMonths = (isoDay, months) => {
  const [year, month, day] = isoDay.split("-").map(Number);
  const total = year * 12 + (month - 1) - months;
  return dayOf(Math.floor(total / 12), (total % 12) + 1, day);
};

for (const testCase of cases) {
  const raw = JSON.parse(readFileSync(join(root, "pipeline/fixtures", testCase.file), "utf8"));
  let history = parse(raw, CUTOFF).H;
  if (testCase.months) {
    history = hist(history.rows.filter((row) => row.day >= minusMonths(iso(history.last), testCase.months)));
  }

  const perDate = analyse(history, raw.meta, { ...BEST, monthSet: "tir" });
  const common = analyse(history, raw.meta, { ...BEST, monthSet: "common" });
  const windows = perDate.RS.W;

  const artifact = {
    code: raw.meta.scheme_code,
    name: raw.meta.scheme_name,
    house: raw.meta.fund_house,
    category: raw.meta.scheme_category,
    navFrom: perDate.json.navFrom,
    navTo: perDate.json.navTo,
    instalments: common.json.instalments,
    dates: perDate.json.dates.map((row, index) => ({
      d: row.d,
      xirr: row.xirr,
      corpus: common.json.dates[index].corpus,
      meanPct: row.meanPct,
      topQ: row.topQ,
      w: perDate.RS.wins[index],
    })),
    spreadPp: perDate.json.spreadPp,
    spreadRupees: Math.round(Math.max(...common.cs) - Math.min(...common.cs)),
    stability: perDate.json.stability,
    metricsAgree: argmax(perDate.xs) === argmax(common.cs),
    verdict: perDate.json.verdict,
    windows,
    // The harness knows nothing about confidence; every fixture is decided by the window
    // count alone, and the instalment half of the rule is unit-tested in verdict.test.ts.
    confidence: windows < 24 ? "reduced" : "full",
  };

  const out = join(root, "pipeline/fixtures/expected", `${testCase.out}.json`);
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`${testCase.out}: ${artifact.instalments} instalments, ${windows} windows, ${artifact.verdict}`);
}
