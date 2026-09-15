# XIRR fixtures for acceptance criterion 2: research report

**Result:** 15 fixtures, each with a trustworthy expected value. The spec's bisection, implemented exactly as written, matches every one of them to 4 decimals (0 failures). It also correctly returns null on the 5 no-root / out-of-bracket cases, as long as it checks the sign at both bracket ends before bisecting. No Excel or LibreOffice was run.

Files, all under `<scratchpad>/xirr/`:
- `xirr-fixtures.json`: 15 entries shaped `{name, source, flows, expected, verifiedBy}`
- `xirr-edge-cases.json`: 7 edge cases
- `diag.json`: per-fixture diagnostics
- `REPORT.md`: findings F1–F14 plus recommendations
- `build-fixtures.js` and `common.js`: rerun with `node build-fixtures.js`
- Saved sources: `ms_xirr.html`, `ms_xnpv.html`, `exceljet_xirr.html`, `exceljet.png`, `lo_xirr.html`, `totn_xirr.html`, `totn_example.png`, `gs_xirr.html`, `openformula.html`, `pyxirr_tests/`
- `fixtures-compact.txt` is stale: it lacks the 15th fixture, which is listed below.

Tools used, all local to the scratchpad: Node 22.22.2, decimal.js 10.6.0, @formulajs/formulajs 4.6.1, pyxirr 0.10.8 in a venv. Nothing was written to the repo.

## 1. Published examples (each checked against the fetched page)

| Source | Flows | Stated result | Our root |
|---|---|---|---|
| [Microsoft Support XIRR](https://support.microsoft.com/en-us/office/xirr-function-de1242ec-6477-445b-b11b-a303ad9adc9d) | -10000 on 2008-01-01; 2750 on 2008-03-01; 4250 on 2008-10-30; 3250 on 2009-02-15; 2750 on 2009-04-01 | 0.373362535 | 0.3733625335 (diff 1.5e-9) |
| Microsoft XNPV page | same flows at 9% | $2,086.65 | 2086.6476 |
| [LibreOffice Help](https://help.libreoffice.org/latest/en-US/text/scalc/01/04060118.html) | -10000 on 2001-01-01; 2000 on 02-01; 2500 on 03-15; 5000 on 05-12; 1000 on 08-10 | 0.1828 | 0.18284349 |
| LibreOffice XNPV | same flows at 6% | 323.02 | 323.0169 |
| [ExcelJet](https://exceljet.net/functions/xirr-function) (flows read from its screenshot; rows not in date order) | -1000 on 2022-01-01; 100 on 06-01; 200 on 12-01; 250 on 03-01; 250 on 09-01; 250 on 12-30 | .0788 | 0.07876331 |
| [TechOnTheNet](https://www.techonthenet.com/excel/formulas/xirr.php) example 1 (Excel screenshot) | -7500 on 2016-01-01; 3000 on 02-01; 5000 on 04-15; 1200 on 08-01; 4000 on 2017-03-26 | 2.660242057 | 2.66024204 (diff 2.1e-8) |
| TechOnTheNet example 2 | -5000 on **2016-04-30**; 800 on 05-31; 1300 on 09-01; 600 on 12-31; 7500 on 2017-01-31 | 2.186309695 | 2.18630968 (diff 1.3e-8) |
| [Google Sheets help](https://support.google.com/docs/answer/3093266) | -4000 on 2012-01-01; 200 on 2012-06-23; 250 on 2013-05-12; 300 on 2014-02-09 | **no result stated** | -0.64408553 |
| [Microsoft Q&A 4941025](https://learn.microsoft.com/en-us/answers/questions/4941025/xirr-function-in-excel-returning-simply-0-00-for-a) (community answer, not Microsoft staff) | 32 rows, identical to pyxirr `minus_0_13.csv`; sum -618.07 | Excel with guess -12.5%: -0.134232640848495. With the default guess Excel showed ~2.98E-09 | -0.13423264080 (diff 5.1e-11) |

- **TechOnTheNet example 2:** the start date appears only in the screenshot. The previous run had assumed 2016-01-01, which gives 1.1086 — wrong. A scan of every start date from 2015-01-01 to 2016-05-30 found only 2016-04-30 reproduces the stated value.
- **Excel Q&A:** this is the only Excel-produced negative rate I found, and a community member reported it.
- **pyxirr test values:** pyxirr's test suite has values below -0.99 (-0.99898, -0.99379, -0.99999) and above 3 (5.85, 32.9). It is UNVERIFIED that these came from Excel, except `minus_0_13`, which matches the Q&A post.

## 2. Excel XIRR semantics

- **Day count:** actual days / 365, with leap days counted and no leap-year divisor (Microsoft, LibreOffice). The XNPV checks above confirm it, with t0 = the first row's date. Excel truncates date serials to whole days.
- **Which date is t0:** Microsoft's formula uses d1 = the "0th payment date" (first row). The support page says a date before the start date gives #NUM!, as do LibreOffice and OpenFormula §6.12.51. But Microsoft's implementer notes ([MS-OI29500 §2.1.1070](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/a003023a-d166-4c12-821a-703ac0870f7d)) say: "In Office, dates in the argument dates can precede the start date."
  - The root does not depend on t0: shifting t0 multiplies NPV by a positive (1+r)^k. Verified: rotating the ExcelJet rows gives the identical rate.
- **#NUM! conditions:**
  - no positive or no negative value
  - values and dates of different lengths
  - no convergence after 100 tries
  - an out-of-range date gives #VALUE! in Office (#NUM! per the standard)
- **Guess and tolerance:** default guess 0.1; stops when accurate "within 0.000001 percent" (about 1e-8); 100 tries.
- **Algorithm:** MS-OI29500 says "Office does not require an iterative technique". Excel's algorithm is undocumented.
- **Newton emulation is not a stand-in for Excel:** my Newton-from-0.1 emulation converges on the Q&A series, where Excel reportedly failed.
- **Where the spec's [-0.99, 3.0] bracket disagrees with Excel:**
  1. Root above 3.0 (e.g. -1000 then +5000 a year later gives r = 4.0): Excel returns it, the spec gives null.
  2. Root below -0.99 (pyxirr `minus_0_99` gives -0.99898): same.
  3. Multiple roots: Excel returns the one near its guess. The spec gives null when the bracket holds an even number of roots, and an arbitrary one when it holds an odd number of 3 or more.
  4. Negative rates where Excel's default guess fails (2.98E-09 or #NUM!): the spec gets the right root, i.e. the spec is better here.

  For the SIP shape (outflows, then one terminal inflow) the root is unique (Descartes' rule of signs), so only cases 1 and 2 can happen.

## 3. Fixtures

**How expected values were verified:**
- Three root finders agree to within 1e-10 (the script throws otherwise): float bisection with 200 iterations, float Brent-Dekker, and decimal.js bisection at 60 significant digits.
- pyxirr agrees to within 5e-9.
- Closed form is checked where one exists.
- A dense grid scan confirms exactly one sign change per fixture.
- `expected` is the 60-digit root rounded to 8 decimals.
- Every root is at least 6.5e-6 from a 4-decimal rounding boundary, so Excel's 1e-8 tolerance cannot change the 4-decimal answer.

**Core fixtures (a)–(f):**
- **(a) ms-support-example**: flows as in section 1; expected **0.37336253**.
- **(b) sip-12m-2024-leap-year**: expected **0.18000003**
  - -10000 on each of 2024-01-08, 02-07, 03-07, 04-08, 05-07, 06-07, 07-08, 08-07, 09-09, 10-07, 11-07, 12-09
  - +131427.91 on 2025-01-07
- **(c) sip-12m-deeply-negative-approx-minus-80pct**: expected **-0.80000001**
  - -10000 on each of 2021-01-15, 02-15, 03-15, 04-15, 05-17, 06-15, 07-15, 08-16, 09-15, 10-15, 11-15, 12-15
  - +55117.75 on 2022-01-17
- **(d) closed-form-two-flow-7y**: -100000 on 2019-03-15, +250000 on 2026-03-16 (N = 2558 days); expected **0.13967731** = 2.5^(365/2558) − 1, confirmed in decimal.js.
- **(e) irregular-multiyear-sip-stepup-skip-lump**: 42 flows; expected **0.14370001**
  - -5000 on 2019-04-10, 05-10, 06-10, 07-10, 08-12, 09-10, 10-10, 11-11, 12-10, 2020-01-10, 02-10, 03-10
  - -25000 on 2020-03-24
  - -5500 on 2020-05-11, 06-10, 07-10, 08-10, 09-10, 10-12, 11-10, 12-10, 2021-01-11, 02-10, 03-10
  - -6050 on 2021-04-12, 05-10, 06-10, 07-12, 08-10, 09-10, 10-11, 11-10, 12-10, 2022-01-10, 02-10, 03-10
  - -6655 on 2022-04-11, 05-10, 06-10, 07-11, 08-10
  - +319772.75 on 2022-09-12
- **(f) sip-24m-near-zero-negative**: expected **-0.00069993**
  - -2500 on the 3rd of each month, moved to the next Monday when the 3rd is a weekend: 2023-01-03, 02-03, 03-03, 04-03, 05-03, 06-05, 07-03, 08-03, 09-04, 10-03, 11-03, 12-04, 2024-01-03, 02-05, 03-04, 04-03, 05-03, 06-03, 07-03, 08-05, 09-03, 10-03, 11-04, 12-03
  - +59956.15 on 2025-01-03

**Extra fixtures:**
- **two-flow-exact-zero**: -50000 on 2024-02-29, +50000 on 2026-02-28; expected **0**. The spec engine returns 7.4e-18, so display code must avoid showing "-0.00%".
- **lump-plus-sip-deeply-negative-approx-minus-95pct**: expected **-0.95**
  - -500000 on 2008-01-07
  - -20000 on each of 2008-02-07, 03-07, 04-07, 05-07, 06-09, 07-07, 08-07, 09-08, 10-07, 11-07, 12-08
  - +90659.07 on 2009-01-07
- **sip-163m-13y-realistic-scale**: 163 × -10000 on the 26th (moved to Monday when it falls on a weekend), 2013-02-26 through 2026-08-26, then +7416019.06 on 2026-09-14; expected **0.2039**.
- **Published examples from section 1:** libreoffice-help-example **0.18284349**; exceljet-example-unordered-dates **0.07876331**; techonthenet-example-1-high-rate **2.66024204**; techonthenet-example-2-high-rate **2.18630968**; google-sheets-help-example-deeply-negative **-0.64408553**.
- **excel-qa-negative-13pct-default-guess-fails**: expected **-0.13423264**. Flows are the 32 rows in their posted order:
  - 2015-05-04 -200; 05-07 -75; 05-15 -620; 05-04 -0.01; 05-06 -100; 05-14 -299.99; 05-19 -20; 05-26 -100
  - 05-27 -340; 06-01 -500; 06-05 -100; 06-18 -1008.52; 06-22 -65; 06-22 -120; 06-22 -450; 06-30 -450.75
  - 07-06 -80; 07-13 -130; 07-16 -1050; 07-31 -1000; 08-10 -65; 08-17 -400; 09-14 -100; 09-16 -956.88
  - 09-28 -117; 10-01 -50; 10-02 -1130; 10-29 -70; 11-02 -188; 11-06 -250; 12-29 -100; 12-31 +9518.08

**For criterion 2**, use core (a)–(f) and add the Excel Q&A fixture as the negative case that actually came from Excel.

## 4. The spec's bisection, run exactly as written

Implementation: bracket [-0.99, 3.0], 100 iterations, `(t - t0)/86400000/365` from the first flow's date, NPV = Σ cf/(1+r)**years, plus a sign check at both ends.

- **Accuracy:** all 15 fixtures match at 4 decimals. The distance from the 60-digit root is 0 to 3.1e-16.
- **Float noise:** scanning ±4e-12 around each root found no place where float NPV has the wrong sign (the worst was 1.9e-16).
- **Early exit:** on the Q&A series float NPV hit exactly 0 at iteration 55, so the `fm === 0` exit is exercised.
- **Speed:** 0.31 ms per call on 164 flows.
- **Bracket ends:** all 15 have NPV(-0.99) > 0 and NPV(3) < 0. The largest |NPV(-0.99)| is 9.6e33, which is finite.

**Edge cases where both bracket ends have the same sign** (the engine returns null):

| Case | Root(s) | NPV(-0.99), NPV(3) | Naive loop without the sign check |
|---|---|---|---|
| root-above-bracket-400pct | 4.0 | +4.99e5, +250 | returns 3.0 |
| root-below-bracket (pyxirr `minus_0_99`) | -0.99898 | both negative | returns -0.99 |
| pyxirr `minus_0_993` | two roots, -0.99960 and -0.99379 | both negative | returns -0.99 |
| two-roots-inside-bracket (-100 on 2020-01-01, +230 on 2020-12-31, -132 on 2021-12-31) | 0.10 and 0.20 | -1.3e6, -50.8 | returns -0.99 |
| all-outflows | none | both negative | returns -0.99 |

- In the two-roots case, pyxirr and Newton from 0.1 both return 0.10. What Excel returns is UNVERIFIED.
- For all-outflows, the literal engine's reason is 'no-sign-change-in-bracket'. Pre-validate so it can say 'no-positive-flow' (Excel gives #NUM!).

Two cases correctly return a rate:
- **sip-12m-sign-inverted:** NPV increases with r. Direction-agnostic bisection returns 0.18000003; a loop that assumes NPV decreases returns 3.0.
- **first-row-not-earliest:** returns the same rate as the unrotated series.

**Recommended engine behaviour:**
- Return `{rate: null, reason}` with one of: 'too-few-flows', 'no-positive-flow', 'no-negative-flow', 'invalid-date', 'npv-not-finite-at-bracket', 'no-sign-change-in-bracket'.
- For SIP-shaped flows the null can be named exactly: NPV(3) > 0 means 'rate-above-300pct'; NPV(-0.99) < 0 means 'rate-below-minus-99pct'.
- Sort flows by date and use the earliest date as t0.
- In tests, assert `toBeCloseTo(expected, 4)`, i.e. |diff| < 5e-5.

## 5. Sign direction, midpoint and float pitfalls

- **Sign direction:** never assume NPV decreases. Compare sign(f(mid)) with the cached sign(f(lo)), and return mid when f(mid) === 0.
- **Midpoint:** (lo+hi)/2 is safe on this bracket. It reaches float resolution after about 52–55 iterations; the rest change nothing. Optionally stop when mid === lo or mid === hi.
- **Near r = -0.99:**
  - `1 + (-0.99)` is 0.010000000000000009, not exactly 0.01.
  - `cf/(1+r)**y` is about cf·100^y, which overflows only when y > ~154 years (`0.01**160` = 1e-320, and `1/that` = Infinity).
  - +Inf plus -Inf gives NaN, and `Math.sign(NaN)` makes every comparison false, so the loop fails silently.
  - Guard both bracket ends with `Number.isFinite`. SIP horizons stay well clear of overflow.
- **Day count, verified:** building dates with local-time `new Date(y, m-1, d)` under New York or London time shifts sip-12m by 2.32e-5, just inside the 5e-5 tolerance (163-month series: about 1e-6). Kolkata is exact. Use UTC or integer day counts.

## Open risks / UNVERIFIED

- No fixture was run in Excel.
  - The synthetic expected values are exact mathematical roots, confirmed by 4 independent methods.
  - Excel with its default guess may return #NUM! or ~2.98E-09 on the -80%, -95% and Google series. My Newton emulation and formulajs both fail on those three (formulajs returns Infinity/NaN), but that doesn't tell us what Excel does. For negative fixtures, "matches Excel" should mean Excel given a suitable guess.
- Some published values are weaker evidence:
  - The Excel Q&A value comes from a community member, not Microsoft.
  - ExcelJet and LibreOffice state only 4 decimals.
  - The ExcelJet flows and TechOnTheNet example 2's date were read from screenshots.
  - The Google example has no stated result.
  - It is UNVERIFIED that pyxirr's other test values came from Excel.
- Microsoft contradicts itself on dates before the first row: the support page says #NUM!, MS-OI29500 says Office accepts them. Sorting the flows makes the question moot.
- Negative-rate lore sources (MrExcel, ExcelForum threads) were only seen in search results, not opened.