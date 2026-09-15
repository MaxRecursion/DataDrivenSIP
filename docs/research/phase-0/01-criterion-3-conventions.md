# SPIKE C3 REPORT: Kotak Mid Cap (119775) conventions that reproduce the spec numbers

**Summary:** 11 of the 14 targets reproduce exactly under one natural set of rules. The 3 that don't are d1 `corpus`, d1 `meanPct` and d1 `topQ`; no reasonable convention gets them. The engine can pass criterion 3 (best 26th, worst 9th, `spreadPp` 0.114, verdict noise). Two open problems: the `stability` value moves across the 0.60 threshold depending on how history is split, and the spec-shaped JSON is 2249 B, which is over the 2 KB limit.

Files (all under `<scratchpad>/spike-c3/`):
- `119775.json`: golden fixture, 132442 B. Saved by the earlier cut-off run and reused. Latest row is 11-09-2026, first is 03-01-2013, so no rows were dropped. 3369 rows. The largest gap between NAV dates is 6 days.
- `harness.mjs`: standalone, Node 22 ESM, no dependencies, UTC day numbers. Output is in `harness_out.txt`; the whole run takes about 13 s.
- `119775.fund.json`: best-convention JSON.
- `REPORT.md`: incremental notes. `lib.mjs`, `explore1..10.mjs` and `out*.txt` are earlier grid searches.
- The project repo was not touched.

## 1. Best convention (enough to reimplement from this text)

**Parsing**
- Parse rows as DD-MM-YYYY into a UTC day number, `floor(Date.UTC(y,m-1,d)/86400000)`.
- Parse NAV as a float. Drop rows that are unparseable or 0. Sort ascending.
- `navFrom` = first row date, `navTo` = last row date.

**NAV lookup**
- `navOnOrAfter(day)` checks `day+0` through `day+7` and returns the first date that has a NAV, otherwise null.
- For this fund, a window of +0..+6 (or even +5) gives identical results. +4 changes `spreadRupees`.

**One SIP**
- Invest ₹10,000 per instalment. Units = 10000 / NAV, fractional, never rounded.
- Each cash flow of −10000 is dated at the **actual NAV date** returned by `navOnOrAfter`, not the target calendar date.
- Terminal flow = total units × terminal NAV, dated at the terminal NAV's date.
- XIRR: bisection on [−0.99, 3.0], 100 iterations.
  - t0 = the earliest flow date; years = (t − t0)/365.
  - If NPV(mid) > 0 then lo = mid, else hi = mid. Return (lo+hi)/2.
- Stored XIRR = round(r × 100, 3).

**Full-history month set ("tir")**
- For each d in 1..28, loop over every calendar month from month(`navFrom`) to month(`navTo`), inclusive.
- target = (y, m, d). Include the month only if both hold:
  - target ≥ `navFrom`
  - `navOnOrAfter(target)` is not null
- Terminal = NAV at `navTo`, dated `navTo`.
- Result for this fund:

| Dates | Instalments | Why |
|---|---|---|
| d=1–2 | 164 | 1 and 2 Jan 2013 are before `navFrom` (3 Jan) |
| d=3–11 | 165 | Sep 2026 is included because a NAV exists on 11 Sep |
| d=12–28 | 164 | — |

**Top-level fields**
- `instalments` = the minimum count across the 28 dates (164). The mode is also 164; d1's count is also 164.
- `spreadPp` = max − min of the unrounded XIRR%, then rounded to 3 dp.
- `spreadRupees` = round(max corpus − min corpus).
- `corpus` is stored as `Math.round`.
- `metricsAgree` = (argmax of XIRR == argmax of corpus). On ties, take the first (lowest d).

**Rolling windows**
- Month M qualifies as a window start if both hold:
  - the 1st of M ≥ `navFrom`
  - the 1st of M+36 ≤ `navTo`
- For this fund that gives W = 128 windows, starting 2013-02-01 through 2023-09-01.
- In each window, every d invests in months M..M+35 using `navOnOrAfter`, with NAV-dated flows as above.
- Terminal = `navOnOrAfter`(1st of M+36), the same for all d.
  - Alternatives that value on or before the 1st put an instalment after the terminal date: 1 window for "on or before", 4 windows for "strictly before". This rule puts none there.
  - If the terminal lookup returns null, drop the window.
- Rank the 28 XIRRs, 1 = highest. Exact ties get the average rank.
- Percentile = (28 − r)/27 × 100, so best = 100 and worst = 0.
- `meanPct` = mean percentile over windows.
- `topQ` = (number of windows with r ≤ 7) / W. For this fund that equals the share with pct ≥ 75.
- If W = 0, `meanPct` and `topQ` are null.

**Split-half stability**
- N = number of NAV rows, h = floor(N/2).
- Half A = `rows[0..h−1]`, half B = `rows[h..N−1]`. Here the cut falls between 2019-11-15 and 2019-11-18.
- Run the identical full-history simulation on each half as if it were the whole history. That means `navFrom`/`navTo` are the half's own first and last rows, and `navOnOrAfter` only sees the half's own rows.
- Take average ranks of the 28 XIRRs in each half. Stability = Pearson correlation of the two rank vectors (Spearman).
- If either rank vector has zero variance, stability = null.

**Verdict**
- Use the §5.5 thresholds, applied to the stored 3-dp values of `spreadPp` and `stability`.
- A null stability never counts as > 0.60.

**Safe-window pick**
- Sort by `meanPct` descending. Break ties by `topQ` descending, then XIRR descending, then smaller d.
- If W = 0, rank by XIRR instead.

**Rounding and copy**
- Every other float in the JSON: `Math.round(x*1000)/1000`.
- Copy denominator: max corpus (1.626%) and best-XIRR date's corpus (1.636%) both print "1.6%". d1's corpus gives 1.652%, which would print 1.7%.
- Years = (`navTo` − `navFrom`)/365 = 13.696, which prints "13.7".
- "₹16.4 L" = 164 × 10,000.

## 2. Match table (best convention)

| Target | Spec | Ours | Result |
|---|---|---|---|
| instalments | 164 | 164 (min) | MATCH |
| navFrom / navTo | 2013-01-03 / 2026-09-11 | same | MATCH |
| best | 26 @ ~20.39 | 26 @ 20.3893 | MATCH |
| worst | 9 @ ~20.28 | 9 @ 20.2757 | MATCH |
| spreadPp | 0.114 | 0.11361 → 0.114 | MATCH |
| d1 xirr | 20.304 | 20.3040 | MATCH |
| d1 corpus | 7530112 | 7458455 | differs |
| d1 meanPct | 44.2 | 35.8 | differs |
| d1 topQ | 0.21 | 0.125 | differs |
| spreadRupees | 123187 | 123186.74 → 123187 | MATCH |
| stability | 0.54 | 0.5446 (0.545 at 3 dp, 0.54 at 2 dp) | MATCH at 2 dp |
| metricsAgree | false | false (max corpus is d3) | MATCH |
| verdict | noise | noise | MATCH |
| copy | ₹1,23,187 / 16.4 L / 1.6% / 13.7 yrs | same | MATCH |

**Sensitivity**

Full-history month set. Best/worst dates are 26 and 9 under every variant tested.

| Month set | best / worst XIRR | spreadPp | d1 XIRR | d1 corpus | spreadRupees |
|---|---|---|---|---|---|
| a1: one common 164-month set (Jan 2013–Aug 2026) | 20.389 / 20.276 | 0.1135 | 20.296 | 7569425 | 60869 (max corpus d1) |
| a2: per-date, no target ≥ `navFrom` check | 20.389 / 20.276 | 0.1136 | 20.296 | 7579273 | 70716 |
| common set with target ≥ `navFrom` (163 months) | 20.391 / 20.285 | 0.1055 → 0.106 | 20.304 | 7448608 | 62543 |
| per-date, also allowing Dec 2012 targets | — | — | — | — | 132290 |

Only the target ≥ `navFrom` rule reproduces 123187 and 20.304 together.

Other axes:
- **Flows dated at the target date:** best 20.386, worst 20.272, d1 20.300.
- **Terminal dated today (2026-09-15):** best 20.363, worst 20.250, d1 20.278. Rejected.
- **Terminal = NAV on/after the 1st of the month after the common set:** best 20.651, d1 20.555. Rejected.

Rolling windows, d1 `meanPct` / `topQ`:

| Variant | d1 meanPct | d1 topQ |
|---|---|---|
| Terminal on/after, on/before, or before the 1st of M+36 (W = 128 or 129) | 35.1–35.8 | 0.124–0.125 |
| Terminal = NAV at last instalment, or on/after day d of M+36 | 47.3–48.3 | 0.31–0.33 |
| Every window valued at global `navTo`, percentile (29−r)/28 | 44.42 (closest to spec) | 0.219 |
| Sub-history windows | 31.0–31.6 | — |

- The global-`navTo` variant is conceptually wrong: windows aren't independent and best ≠ 100.
- The safe-window winner is the 12th in every one of the 144 rolling variants.

Split-half `stability`, rank by XIRR:

| Split | NAV-dated | Target-dated |
|---|---|---|
| Row floor | 0.5446 | 0.5550 |
| Row ceil | 0.5430 | 0.5490 |
| Month boundary 1 Nov 2019 | 0.5479 | 0.5523 |
| Month boundary 1 Oct 2019 | 0.539 | — |
| **Calendar-day midpoint 2019-11-07** | **0.6185** | **0.6152** |

- The calendar-day midpoint split gives verdict **"marginal"**.
- Common-set 82/82 month splits range 0.60–0.67 depending on how half 1 is valued.
- Ranking by corpus gives −0.57 to 0.24.
- Across 364 exploratory variants the range is −0.77 to 0.87.

## 3. 28-row table (best convention)

| d | xirr | corpus | n | meanPct | topQ |
|---|---|---|---|---|---|
| 1 | 20.304 | 7458455 | 164 | 35.8 | 0.125 |
| 2 | 20.301 | 7452544 | 164 | 31.8 | 0.063 |
| 3 | 20.302 | 7575730 | 165 | 34.8 | 0.055 |
| 4 | 20.292 | 7566098 | 165 | 33.2 | 0.094 |
| 5 | 20.278 | 7553601 | 165 | 28.3 | 0.102 |
| 6 | 20.290 | 7556865 | 165 | 33.0 | 0.109 |
| 7 | 20.286 | 7550875 | 165 | 27.6 | 0.000 |
| 8 | 20.281 | 7544265 | 165 | 24.3 | 0.016 |
| 9 | 20.276 | 7536906 | 165 | 21.6 | 0.008 |
| 10 | 20.286 | 7539238 | 165 | 26.9 | 0.008 |
| 11 | 20.309 | 7549158 | 165 | 50.3 | 0.102 |
| 12 | 20.319 | 7541087 | 164 | 58.9 | 0.148 |
| 13 | 20.321 | 7538816 | 164 | 52.3 | 0.219 |
| 14 | 20.317 | 7532100 | 164 | 48.4 | 0.070 |
| 15 | 20.318 | 7528652 | 164 | 44.0 | 0.086 |
| 16 | 20.333 | 7534318 | 164 | 46.5 | 0.211 |
| 17 | 20.327 | 7527349 | 164 | 43.3 | 0.086 |
| 18 | 20.316 | 7516719 | 164 | 48.1 | 0.000 |
| 19 | 20.313 | 7511034 | 164 | 54.2 | 0.258 |
| 20 | 20.315 | 7508556 | 164 | 54.1 | 0.125 |
| 21 | 20.340 | 7519236 | 164 | 67.7 | 0.406 |
| 22 | 20.354 | 7524238 | 164 | 77.7 | 0.773 |
| 23 | 20.354 | 7520154 | 164 | 73.2 | 0.766 |
| 24 | 20.376 | 7529128 | 164 | 83.4 | 0.781 |
| 25 | 20.384 | 7529546 | 164 | 86.1 | 0.859 |
| 26 | 20.389 | 7529348 | 164 | 79.4 | 0.641 |
| 27 | 20.380 | 7520029 | 164 | 69.9 | 0.406 |
| 28 | 20.372 | 7511972 | 164 | 65.1 | 0.484 |

**Summary values**
- `spreadPp` 0.114, `spreadRupees` 123187
- `stability` 0.545
- `metricsAgree` false (top XIRR d26, top corpus d3, lowest corpus d2)
- verdict noise
- W = 128, with no tied windows
- Safe window 3..12 winner by `meanPct`: **12th** (58.9)

**Rolling window wins (rank 1)**
- d24: 32, d22: 29, d25: 18, d26: 16, d16: 10, d23: 10, d13: 5, d1: 3, d4: 3, d27: 2.

**Cost:** `analyse()` takes 477 ms per fund, single-threaded. That's about 32 min for 4000 funds on one core, so the pipeline needs worker threads to meet the 20-minute budget.

## 4. Fund JSON and size

`119775.fund.json` uses the spec's shape with all floats at 3 dp.

| Layout | Raw | gzip-9 | Under 2 KB raw? |
|---|---|---|---|
| Spec shape, 3 dp | 2249 B | 755 B | No |
| Drop the `d` key (array index = d−1) | 2062 B | 682 B | No |
| `meanPct` 1 dp, `topQ` 2 dp | 2166 B | 699 B | No |
| Drop `d` and use 1 dp / 2 dp | 1979 B | 625 B | Yes, barely |
| Columnar arrays (`xirr[]`, `corpus[]`, `meanPct[]`, `topQ[]`), 3 dp | 1113 B | 617 B | Yes |
| Add per-date `n` | 2473 B | — | No |
| Pretty-printed | 3705 B | — | No |

**Recommendation:** read "under 2 KB" as gzip (every variant passes), or change the schema to columnar arrays. Long fund names will make the spec shape even bigger.

## 5. Targets that can't be reproduced

- **d1 corpus 7530112.**
  - With 164 flows fixed to give XIRR 20.304, the corpus follows from the XIRR. Getting +0.96% more corpus at the same XIRR would need the terminal date about 19 days after `navTo`.
  - No month-set, terminal, stamp-duty or unit-rounding variant got within ±3 of 7530112 for any date.
  - It sits close to the mean (7528786) and median (7529447) corpus across the 28 dates, and to d26's 7529348.
  - Verdict: illustrative placeholder.
- **d1 meanPct 44.2 and topQ 0.21.** No variant among 144+ gives both.
  - Rolling windows valued at their own end give 35.8 / 0.125.
  - The nearest, 44.42 / 0.219, needs every window valued at global `navTo` with a (29−r)/28 percentile, which is methodologically wrong.
  - 0.21 would need 27 of 128 windows; the nearest variant gets 28.
  - Verdict: illustrative. The example has a single-element `dates` array, which fits that.
- **stability 0.54.** Matches only at 2 dp under the row-count (or month-boundary) split; stored at 3 dp it's 0.545. The spec's own "3 decimals" rule conflicts with its example here.
- **UNVERIFIED:** the spec's "verified independently" claim cannot be confirmed for these three fields. Criterion 3 does not include them.

## 6. Short history (truncated to rows dated on or after `navTo` minus K calendar months, same day of month)

**K = 40** (2023-05-11..2026-09-11, 824 rows)
- Instalments: 40. W = 4 windows, starting Jun–Sep 2023.
- Best d13 14.669, worst d10 13.968. `spreadPp` 0.700, `spreadRupees` 19823.
- `stability` −0.498 (halves of 20 and 19–20 instalments), `metricsAgree` false.
- Verdict **"marginal"**, reached through the spread condition alone. Safe-window winner: 4th.
- `topQ` can only be 0, 0.25, 0.5, 0.75 or 1. `meanPct` ranges from 0.0 (d18) to 99.1 (d13).
- No crash, no NaN, no ties.

**Shorter histories**

| K | W | stability | verdict |
|---|---|---|---|
| 38 | 2 | −0.335 | marginal |
| 37 | 1 | −0.579 | marginal |
| 36 | 0 | −0.248 | marginal |
| 35 | 0 | −0.465 | marginal |

- At W = 0, `meanPct` and `topQ` are null. The pick falls back to XIRR: 12th at K = 36, 11th at K = 35.
- Funds with 36 months of history pass §4.2 eligibility and get W = 0.

**Things that would break a naive engine**
- Dividing by W = 0 gives NaN.
- Pearson returns NaN on zero variance (didn't happen here).
- Exact XIRR ties are possible if two dates always land on the same NAV date (didn't happen here).
- Short funds get "marginal" from spread alone, which would overstate confidence.

**Recommended reduced-confidence rules**
- Set `confidence: "reduced"` when W < 24 (history under about 60 months) **or** either split half has fewer than 24 instalments.
- In reduced mode:
  - Store `meanPct`/`topQ` as null when W = 0 and pick by XIRR within the safe window.
  - Cap the verdict at "noise" (or show the reduced-confidence copy), since spread over 40 months is mostly return level and not a date effect.
  - Hide `topQ` when W < 8.
- Add fixtures for K = 36, 37 and 40 to the tests.

## Open risks

- **Stability threshold (highest impact).** The 0.60 cutoff falls inside the range that convention choices produce (0.54–0.62 for reasonable splits). A calendar-day midpoint split flips this fund to "marginal". The spec must pin the row-count split, and the test should assert 0.545.
- **Spec example.** The spec's example `corpus` / `meanPct` / `topQ` values should be marked illustrative in PLAN.md, or tests will chase numbers no convention produces.
- **Terminal date in windows.** Valuing a window on or before its end produces instalment dates after the terminal date. Keep the on/after-the-1st rule.
- **Missing lookahead test.** +0..+7 vs +0..+6 makes no difference here (largest gap is 6 days). Funds with longer gaps need a separate test.
- **Size.** The 2 KB limit fails in the spec's shape (see §4).
- **Runtime.** About 0.5 s per fund, so the pipeline needs a worker pool.