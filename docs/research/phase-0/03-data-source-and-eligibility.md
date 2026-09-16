# Data-source & eligibility probe: SIP Date Planner, Phase 0 (2026-09-15)

Work dir: `<scratchpad>/data-probe`
- Full report: `REPORT.md`. Scripts: `scripts/` (`funnel.py`, `liveness_types.py`, `sample_hist.mjs`, `analyze_sample.py`, `boundary.mjs`, `survivors2.py`, `final3.py`, `fixtures.mjs`).
- Data: `mf_list.json`, `mf_latest_all.json`, `NAVAll.txt`, `probe2/NAVAll_1224IST.txt`, `hist/*.json` (274 full histories), `boundary.json`, `survivors_v2.json` (1,162), `survivors_final.json` (1,043), `index_*.json`.
- Nothing was written to the project repo.

## Headline
- **The spec's 3,500–4,600 survivor estimate is about 3.5x too high.** Live Direct Growth funds with at least 36 months of history number **1,162**. After sanity exclusions it's **1,043 (strict) to 1,084 (lenient)**.
- **Cause: the liveness filter.** Name filtering leaves 4,723 schemes. Only 1,760 of those have a NAV in the last 12 days, a 63% drop. The spec's range roughly matches the 4,723 name-only count.
- **Recommendation:** change the expected count to about 1,000–1,300, and have the pipeline fail only outside about 800–1,600.

## 1. mfapi endpoints (verified by fetching; OpenAPI saved as `mfapi_openapi.json`)
**Documented endpoints:** `/mf` (limit, offset), `/mf/search?q=`, `/mf/{code}` (startDate, endDate as YYYY-MM-DD), `/mf/{code}/latest`, `/mf/latest`.

**`/mf`**
- 37,882 unique entries of `{schemeCode:int, schemeName, isinGrowth|null, isinDivReinvestment|null}`.
- 5.74 MB raw. No house, category, type or date.

**`/mf/latest`**
- 37,882 entries of `{schemeCode, schemeName, fundHouse, schemeType, schemeCategory, isinGrowth, isinDivReinvestment, nav, date "DD-MM-YYYY"}`.
- 11.17 MB raw, 800,593 B gzip on the wire, 0.62 s to first byte, 0.95 s total.
- 2,329 `nav` values are null.
- **Recommendation:** this one request can replace `/mf` plus the liveness check.

**`/mf/{code}`**
- Shape: `{meta:{fund_house, scheme_type, scheme_category, scheme_code, scheme_name, isin_growth, isin_div_reinvestment}, data:[{date,nav}], status:"SUCCESS"}`.
- Newest first. All 250 sampled histories were sorted and had no duplicate dates.
- Adding `?startDate=2026-09-01` works: 9 rows, 316 B on the wire.

**Errors**
- `/mf/abc` returns HTTP 400 `{"error":"invalid scheme_code"}`.
- **Trap:** `/mf/999999` (unknown code) returns HTTP 200 with `status:"SUCCESS"`, empty meta (`scheme_code:0`) and `data:[]`. The pipeline must treat this as not found.

**Headers**
- HTTP/2, nginx/1.24.0, gzip, `vary: Accept-Encoding`.
- None of: cache-control, ETag, Last-Modified, rate-limit headers. No content-length on gzipped responses.
- The site says there is no rate limiting and data updates 6 times a day (10:05, 14:05, 18:05, 21:05, 03:09, 05:05 IST).

**Latency** (250 histories, concurrency 6, from this Mac): mean 64 ms, p50 53, p90 99, max 274, no errors. Latency from GitHub runners is UNVERIFIED.

**Size per full history:**

| | mean | p50 | p90 | max |
|---|---|---|---|---|
| raw | 67.9 KB | 48.5 KB | 133 KB | 236 KB |
| gzip on the wire (level 6) | about 10.0 KB | | | |
| rows | 1,717 | | | 6,053 |

## 2. AMFI NAVAll.txt (verified)
**URL:** `https://portal.amfiindia.com/spages/NAVAll.txt`. Both `http://` and `www.amfiindia.com` 302-redirect there.
- 1,519,199 B raw, about 256 KB gzip.
- Has ETag and Last-Modified. Conditional requests (If-None-Match, If-Modified-Since) return 304 with 0 B.
- AMFI republishes during the day: Last-Modified moved from 07:09 to 12:24 IST, with 6 rows changing from 10-Sep to 11-Sep.

**Format**
- Header: `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date`. That is 8 `;`-separated fields; Plan and Option are now separate columns.
- Section header lines look like `Open Ended Schemes(Equity Scheme - Mid Cap Fund)`. An AMC name line follows. Lines containing a single space separate blocks.
- Example row: `119775;INF174K01LT0;-;Kotak Mid Cap Fund;Direct Plan;Growth;169.7730;11-Sep-2026`. Dates are DD-Mon-YYYY; a missing ISIN is `-`.
- 14,361 rows, 103 sections (97 open-ended, 5 close-ended, 1 interval), 54 AMCs.
- 17 NAVs are written as `10.` (still parse as floats).

**Liveness prefilter**
- NAVAll gives each code's latest NAV date. 11-Sep-2026 has 8,002 rows and 14-Sep-2026 has 705 (14-Sep is a market holiday, so these are calendar-day NAV funds). 831 distinct dates in total.
- It works as a one-request liveness prefilter. Its live set is identical to the one from `/mf/latest` (1,760 codes). Every NAVAll code exists in mfapi.

## 3. Eligibility funnel (verified)

| Step | `Direct` (case-sensitive) | `/direct/i` |
|---|---|---|
| Name contains Direct | 11,890 | 12,581 |
| + `/growth/i` | 4,774 | 5,121 |
| + exclusion regex | 4,723 | 5,070 |
| + NAV within 12 days | **1,760** | 1,760 |

- **Case:** `/direct/i` adds no live funds and matches "Indirect Plan", so keep case-sensitive `Direct`.
- **Stale breakdown** of the 4,723: 2,202 are not in NAVAll at all, 717 last reported over 365 days ago, 41 in 31–365 days, 3 in 13–30 days.
- **Bug in the exclusion regex:** `dividend` wrongly drops 13 live Direct Growth "Dividend Yield" funds (e.g. 129312, 118527, 119507). Fix: `/IDCW|dividend(?! yield)|payout|reinvest|bonus/i`.

**36-month rule**
- Stratified sample: 171 of 250 passed (68.4%).

  | Group | Pass rate |
  |---|---|
  | Equity | 70% |
  | Debt | 89% |
  | ETF | 33% |
  | FoF | 61% |
  | Hybrid | 74% |
  | Index | 46% |
  | Other | 86% |

- **Code proxy:** scheme codes are assigned in launch order, so the code predicts history length. On the sample it had one error: 148308, whose NAVs are all zero.
- **Boundary check:** I made 353 cheap windowed requests (`?startDate=2000-01-01&endDate=2023-09-11`, 2.1 s total) covering every live code from 150500 to 153200. 144 passed. The cutover is between codes 152041 and 152062.
- **Result:** 1,162 pass = 171 from the sample + 144 from the boundary check (both exact) + 847 codes below 150500 assumed to pass.

## 4. Survivors that shouldn't get a SIP-date answer (out of 1,162)

**Exclude:**
- **Not open-ended: 31** (30 close-ended, 1 interval). Examples: 146974 SBI FMP Series 1 (3668 Days), 149924 HDFC FMP 1861D March 2022, 140487 SBI Long Term Advantage Fund Series IV, 118691 Nippon India Interval Fund.
- **ETFs: 6.** Examples: 105463 UTI Gold ETF, 148173 UTI Nifty Bank ETF.
- **Segregated-portfolio units: 7** (148261–148313).
  - Their latest NAV is null in `/mf/latest`, 0.0000 in NAVAll, and every one of 1,578 rows since 06-03-2020 is 0 — yet their date shows as current.
  - They carry exactly the same name as the main fund.
  - **Rule:** drop NAVs of 0 first, then test liveness on the latest valid NAV.
  - **Do not exclude `/segregat/i` by name:** 6 main live funds have it in their names (118780, 118726, 118794, 119400, 130050, 134594).
- **Flat NAV: 2 seen.** 139388 and 139390 (Invesco India Liquid Fund - Direct Plan - Growth) have sat at 1000.0000 since 2023 and have no growth ISIN.
  - **Rule:** 2 or fewer distinct NAVs in the last 60 rows.
  - 5 final survivors have a null growth ISIN: 4 Invesco Liquid legacy plans and 120784 UTI ULIP.
- **"Unclaimed" plans: 4** (JM Liquid and JM Overnight, e.g. 148413, 149829). Rule: `/unclaim/i`.
- **Target-maturity index funds and FoFs: 71.** Maturity years: 8 in 2026, 23 in 2027, 15 in 2028, 18 in 2029–2037.
  - Examples: 149474 SBI CPSE Bond Plus SDL Sep 2026, 147857 Bharat Bond FOF April 2030.
  - Strict option: exclude all. Lenient option: exclude only those maturing within 12 months.

**Product call:**
- **Overnight (34) and liquid (39).** The NAV is a smooth accrual line, so every date gives the same XIRR and the verdict is always "noise". I recommend excluding them.

**Keep:**
- Money market, ultra short and low duration (66)
- Arbitrage (24)
- Index funds (164, including the 71 target-maturity funds)
- FoFs (114, of which 42 overseas; whether overseas FoFs accept SIPs is UNVERIFIED)
- ELSS (41) and retirement/children's funds (37)
- Legacy share classes (3: 118506 Retail, 118577 Super Institutional, 119757 Provident Fund and Trust) — keep but flag.

**Final counts**

| Stage | Count |
|---|---|
| After zero-NAV, non-open, ETF and unclaimed exclusions | 1,114 |
| Strict: also drop all target-maturity | **1,043** |
| Lenient: drop only target-maturity within 12 months | 1,084 |
| Strict, also excluding overnight and liquid | about 970 |
| Re-including Dividend Yield funds | adds about 11 |

**Consistency check:** the spec's 119775 example (`navFrom` 2013-01-03, `navTo` 2026-09-11) matches live mfapi exactly (3,369 rows).

## 5. Cold run and nightly updates
**Cold run** (verified inputs; timing is arithmetic)
- Requests: 1 to `/mf/latest` (800 KB), then 1,760 full histories.
- Bytes: 17.6 MB on the wire, 120 MB raw.
- Time at concurrency 12:

  | Latency per request | Total time |
  |---|---|
  | 64 ms (measured) | about 9 s |
  | 250 ms | 37 s |
  | 500 ms | 73 s |
  | 1 s | 147 s |

- Even at 1 s per request that is more than 8x inside the 20-minute budget.

**Nightly updates**
- A cache keyed by latest NAV date invalidates nightly for nearly every live fund, so each night is a full refetch. That's cheap (about 18 MB) but wasteful.

**Incremental options**
- **(a) Append NAVAll's latest NAV.** One conditional request. It only carries one date per code, so a missed night leaves a gap and corrections go undetected.
- **(b) Windowed mfapi fetch.** `/mf/{code}?startDate=<last cached date − 7d>` is about 300 B each, about 0.5 MB for all funds. It survives missed nights, and overlapping rows can be overwritten to pick up corrections.
- **(c) Weekly full refresh**, plus a full refetch whenever the overlap doesn't match.

**Recommendation:** use (b) plus (c), with NAVAll as a liveness cross-check only. Schedule the nightly run after about 05:30 IST (00:00 UTC). That timing is UNVERIFIED for late-reporting AMCs.

## 6. index.json size (verified; compact JSON, UTF-8)

| Variant | Rows | Raw | gzip-9 | brotli-11 |
|---|---|---|---|---|
| Strict, `[code,name,house,category]` | 1,043 | 138,454 | **16,301** | 13,101 |
| Lenient | 1,084 | 144,182 | 17,013 | 13,715 |
| Before exclusions (≥36 months) | 1,162 | 154,679 | 18,370 | 14,758 |
| All live name-filtered | 1,760 | 234,654 | 27,099 | 21,673 |
| Name filter only | 4,723 | 566,807 | 65,513 | 50,577 |
| Strict, house and category as dictionary indexes | 1,043 | 81,984 | 14,386 | 11,382 |
| Dictionary + " - Direct Plan - Growth" suffix stripped (on 1,037 names) | 1,037 | 55,578 | 13,272 | 10,713 |

- The 120 KB gzip budget passes about 7x over. Dictionary encoding saves only about 12%, so it isn't worth the complexity.
- **Categories:** mfapi's house and category equal NAVAll's AMC line and bracketed section text for all survivors, with no mismatches. "Equity Schemes - Mid Cap Fund" is AMFI's own string.
  - AMFI mixes two naming schemes: 73 distinct categories across 40 houses, e.g. "Equity Scheme -" vs "Equity Schemes -", "Debt Scheme - Liquid Fund" vs "Income/Debt Oriented Schemes - Liquid Fund", and "Solution Oriented Schemes ** -".
  - **Recommendation:** add a normalisation map for display. Keep the raw string in `funds/{code}.json` so the §13.3 check still matches.

## 7. Criterion-5 fixtures (verified from full histories)
All are open-ended, Direct Growth, last NAV 11-09-2026, with no zero NAVs and no gaps over 7 days. Months are counted from the first NAV to 11-09-2026.

| Code | Fund | First NAV | Months | Rows |
|---|---|---|---|---|
| **151713** | quant Dynamic Asset Allocation Fund - Direct Plan - Growth Option | 13-04-2023 | **40** | 842 |
| 151750 | HDFC Defence Fund - Direct Plan - Growth Option | 02-06-2023 | 39 | 808 |
| 151745 | WhiteOak Capital Multi Asset Allocation Fund - Direct Plan - Growth Option | 22-05-2023 | 39 | 803 |
| 151384 | Kotak Banking and Financial Services Fund - Direct Plan - Growth | 06-03-2023 | 42 | 866 |
| 151611 | NJ ELSS Tax Saver Fund - Direct Plan - Growth Option | 19-06-2023 | 38 | 797 |

- **Recommendation:** use 151713 as the primary fixture and 151750 as the equity backup.
- **Risk:** these funds age one month per month. The fixture must be a committed, date-truncated snapshot, not a live API call.

## 8. Typeahead
**"kotak" and "mid"** (case-insensitive) in the strict final set: exactly 2 matches.
- 119775 Kotak Mid Cap Fund - Direct Plan - Growth
- 120158 Kotak Large & Mid Cap Fund - Direct Plan - Growth

Three more Kotak Midcap index funds are live but under 36 months: 152767, 152916, 153401. They will join once they pass 36 months (from about 2027), so the scorer must still rank 119775 first then.

**Shared first two tokens** (tokens are `[a-z0-9&]+`):
- 507 groups; 418 names are unique on their first two tokens; 625 share them with at least one other name.
- Largest groups: icici prudential 76, aditya birla 61, nippon india 52, invesco india 37, lic mf 31.
- The first token is the house brand in all but 10 names. Kotak has 49 names.
- "kotak mid" is a group of one.

**Suggested scoring rule:** consecutive query tokens should match consecutive name-token prefixes starting at token 0, with a bonus for earlier position and shorter names. Under that rule 119775 beats 120158 ("mid" is the 3rd token there) and the future "Kotak Nifty Midcap ..." funds.

**Duplicate display names** that need a house, category or code shown to tell them apart (or deduping):
- Invesco India Liquid Fund - Direct Plan - Growth: 5 codes (120537 plus 139387–139390)
- Sundaram Small Cap: 119588, 119589
- Kotak Aggressive Hybrid: 119767, 133035
- Axis Children's Fund: 135762, 135764
- Segregated-portfolio codes, which share their main fund's name

## Open risks and unverified items
- **Latency from GitHub Actions runners and mfapi's server location are UNVERIFIED.** There is no stated rate limit, and there are no retry headers to rely on.
- **mfapi returns HTTP 200 with empty data for unknown codes,** so a success status isn't enough.
- **`/mf/latest` can have null `nav`.** Parse defensively.
- **Proxy region:** for the 847 codes below 150500 (not sampled), passing the 36-month rule is inferred from the code rather than fetched. Other all-zero or flat-NAV funds may be hiding there, though the sample found only 1 in 250 (148308).
- **Survivor totals are sensitive to product decisions:** target-maturity funds, overnight/liquid funds, and the Dividend Yield regex fix.
- **Over-strict exclusion:** only 1,043 funds would be answerable. Any check that expects more than about 1,600 funds will fail.