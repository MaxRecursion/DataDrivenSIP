# SIP Date Planner — design and implementation plan

Status: **Approved 2026-09-15 ("approve all").** Every recommendation in §0 is accepted,
including both D4 calls: drop all target-maturity funds, and exclude overnight and liquid
funds. Phase 1 is in progress.

Written 2026-09-15, revised the same day after an independent three-way review
(spec traceability, fact-check, feasibility).

Before writing this I ran research spikes against real data and real tooling, so the plan
rests on measured numbers rather than assumptions. Reports and frozen fixtures are in
[`docs/research/phase-0/`](docs/research/phase-0/). The throwaway research code never
touched the app.

Anything in the spec not listed in §0 is built as written. Changing an approved D-item
needs the user's explicit sign-off.

Sections:

0. [Decisions I need from you](#0-decisions-i-need-from-you)
1. [What the research established](#1-what-the-research-established)
2. [Architecture](#2-architecture)
3. [Data pipeline](#3-data-pipeline)
4. [Analysis engine — exact conventions](#4-analysis-engine--exact-conventions)
5. [Artifacts](#5-artifacts)
6. [Runtime app](#6-runtime-app)
7. [Visual design](#7-visual-design)
8. [Motion](#8-motion)
9. [Performance budgets](#9-performance-budgets)
10. [Hosting and CI](#10-hosting-and-ci)
11. [Compliance](#11-compliance)
12. [Testing strategy](#12-testing-strategy)
13. [Acceptance criteria — how each is proven](#13-acceptance-criteria--how-each-is-proven)
14. [Phases and gates](#14-phases-and-gates)
15. [Risks, open questions, and things only you can do](#15-risks-open-questions-and-things-only-you-can-do)

---

## 0. Decisions I need from you

### Engine and data

#### D1 — Which month set feeds the rupee numbers

The conventions that reproduce your Kotak numbers (§4) simulate each date over every month
in which that date could actually be invested. For Kotak that gives the 3rd–11th **165**
instalments and every other date **164**. The reason is that 1–11 Sep 2026 already have a
NAV, while 1–2 Jan 2013 fall before the fund's first NAV.

That rule is harmless for XIRR, but it distorts anything measured in rupees:

| | Per-date months (spec-literal) | Same 164 months for every date |
|---|---|---|
| `spreadRupees` | ₹1,23,187 (matches your example) | ₹60,869 |
| Highest-value / lowest-value date | 3rd (extra instalment) / 2nd | 1st (invests earliest) / 20th |
| Edge of the 12th over the window median | −₹8,930 (an artifact) | +₹63 |
| `stability`, verdict (same split rule) | 0.545, noise | 0.608, **marginal** |

Running *everything* on the common month set flips Kotak to "marginal" and breaks
criterion 3. So XIRR, windows and stability must stay on the per-date rule.

**Recommendation: split the two by what they measure.**
- **Per-date rule:** XIRR, `meanPct`, `topQ`, `w`, `stability` and the verdict. This is
  what reproduces criterion 3.
- **One common month set:** `corpus`, `spreadRupees`, `metricsAgree` and `instalments`.
  Every date then invests the same rupees over the same months.

Rupee copy rules under this recommendation:
- **Name the dates.** `spreadRupees` is the gap between the *highest-value and lowest-value
  dates*. For Kotak those are the 1st and 20th, not the 26th and 9th, which are the XIRR
  extremes. The copy names them.
- **Percent base.** "% of final value" divides by the highest corpus.
- **State the notional amount.** The copy says it's a notional ₹10,000/month.

Alternative: use the per-date rule everywhere, and accept rupee comparisons that mix 164 and
165 instalments.

#### D2 — Criterion-3 conventions and illustrative example values

**These match the spec.**
- Best 26th at 20.389% and worst 9th at 20.276% match the spec's ~20.39 / ~20.28 to 2 dp.
- Exact matches: `spreadPp` 0.114, d1 `xirr` 20.304, `spreadRupees` 123187 (per-date rule),
  `instalments` 164, `metricsAgree` false, verdict noise.
- An independent re-implementation matched all 28 rows.

**Three example values don't reproduce** under any sensible convention: d1 `corpus`
7530112, d1 `meanPct` 44.2 and d1 `topQ` 0.21. I tried 144+ variants; they look like
placeholders.

**Stability** is 0.5446: 0.54 at 2 dp, and 0.545 under the spec's own 3-decimals rule.

**Conventions I've pinned that read the spec's wording in a particular way:**
- `navOnOrAfter` takes a map keyed by UTC day number and a day number, rather than
  `Map<DateKey>` and a `Date`. The behaviour is the same; the types just avoid timezone
  bugs.
- "Up to 7 days" means target +0 through +7. For Kotak, +6 and +5 give identical results;
  +4 changes `spreadRupees`.
- Split-half uses NAV-row halves (§4).
  - **Why this matters:** Kotak's stability sits near the 0.60 threshold. Across reasonable
    month-set and split choices it ranges roughly **0.51–0.67**. So the verdict for this
    fund is convention-sensitive, which is itself a sign of noise.

**Recommendation:**
- Pin the §4 conventions.
- Assert criterion 3 on NAV data frozen at 2026-09-11: best 26th, worst 9th, `spreadPp`
  0.114, verdict noise, plus the full 28-row snapshot.
- Don't assert the three illustrative values.
- Prove it through the *pipeline*, not just the engine, using `pnpm pipeline --as-of
  2026-09-11 --codes 119775` against the fixture source (Phase 3).

#### D3 — Fund JSON size budget

The Kotak file in the spec's shape is **2,249 B raw** and **755 B gzipped**. "Under 2 KB"
fails if it means raw bytes, and long fund names make it worse.

**Recommendation:** keep the spec's readable shape, add three fields (§5), and enforce
**< 2 KB gzipped** in CI. That comes to about 2.5 KB raw.

Alternative: columnar arrays (`xirr: [...]`) at about 1.2 KB raw.

#### D4 — Fund universe: about 980 funds, not 3,500–4,600

On today's data the name filters leave 4,723 schemes, which roughly matches your range. The
12-day liveness rule then drops 63% of them as dead schemes, and the ≥36-month rule leaves
~1,162.

That figure is partly estimated. 315 codes were fetched or boundary-checked. The other 847
low codes were inferred to pass because codes are assigned in launch order.

Recommended extra rules:

| Rule | Removes | Why |
|---|---|---|
| `scheme_type` must be "Open Ended Schemes" | 31 | FMPs, close-ended and interval funds can't take SIPs |
| ETFs | 6 | exchange-traded, no SIP via the AMC |
| Drop zero NAVs before the liveness test | 7 | segregated portfolios report 0 but look current |
| Flat NAV (≤2 distinct values in the last 60 rows) | 2 | dead legacy plans |
| `/unclaim/i` | 4 | unclaimed-dividend plans |
| Target-maturity index funds and FoFs | 71 | **your call:** keep all, drop all (recommended), or drop only <12 months to maturity |
| Overnight and liquid funds | 73 | **your call:** always "noise" by construction and rarely SIP'd; I recommend excluding |
| Fix `dividend` → `dividend(?! yield)` | adds ~11 back | the spec regex wrongly drops live "Dividend Yield" growth funds |

**Result:** about **980 funds** with every recommendation, and 970–1,095 depending on your
two calls.
- **Fund-count guard:** keeps your ">10% drop" rule and adds an absolute sanity range of
  800–1,600.
- **`index.json`:** about 16 KB gzipped, versus the 120 KB budget.
- **`Direct`:** stays case-sensitive; `/direct/i` adds no live funds and matches "Indirect".

#### D5 — What "reduced confidence" means (criterion 5)

A fund with ~36 months of history has **zero** rolling windows, so `meanPct` is undefined.
The real 40-month fixture (151713, quant Dynamic Asset Allocation) has 5 windows. Short
histories also tend to get "marginal" from spread alone. Over 40 months, spread mostly
reflects return level, not a date effect.

**Recommendation:**
- Add `windows` (the count) and `confidence: "full" | "reduced"`.
  - `"reduced"` when there are fewer than 24 windows, or either split half has fewer than
    24 instalments.
  - **The verdict formula is untouched.**
- In reduced mode the headline uses the reduced-confidence copy (D7).
- With 0 windows, `meanPct` and `topQ` are null, and the pick falls back to XIRR inside the
  window.
- **Fixtures:** 151713, asserting 5 windows and "reduced", plus Kotak cut to 36, 37 and 40
  months.

#### D6 — Safe-window arithmetic

The spec's "wrap mod 28" is ambiguous: a naive `(s+2) % 28` gives day 0 for s=26.

**Recommendation:**
- **Inputs:** `salary` is `last` (the default) or 1–31. `buffer` is 0–7, default 2.
- **Window:** always 10 consecutive dates on a 1-based 28-day circle:
  - `start = (salary === "last" || salary >= 29) ? 1 + buffer : salary + buffer`
  - `window = [0..9].map(k => ((start + k - 1) % 28) + 1)`
- **Checks against the spec:** default gives 3–12 ✓; `salary=28` gives 2–11 ✓; salary 1–29
  gives s+buffer through s+buffer+9 ✓.
- **Deliberate departure:** salary on the 30th or 31st behaves like "last working day"
  (3–12 with buffer 2). The literal mod-28 formula gives 4–13 and 5–14, which pushes the
  SIP later than needed.
- **Buffer 0 or 1** can put the window start on the 1st or 2nd.

#### D7 — Copy table (verdict × confidence × edge)

The spec's copy needs baselines, and parts of it contradict the algorithm.
- "+0.31 pp" has no reference point.
- "Cleanest fit after your salary lands" doesn't describe a pick made by `meanPct`.
- "Edges ahead" can be false when a marginal verdict comes from an unstable spread.
- "Real advantage" reads like advice.

**Recommendation: one explicit table**, unit-tested for every branch.

Definitions:
- `edgePp` = the answer's XIRR minus the median XIRR of the 10 window dates.
- `nth` = the ordinal of the answer date.

| Condition | Headline copy (past tense, sentence case) |
|---|---|
| `confidence = reduced` | "This fund has {months} months of history, too little to tell whether the date matters. The {nth} fits your window." |
| `noise`, or any verdict with `edgePp ≤ 0.005` | "Any date in your window has done about the same in this fund. The {nth} is a tiebreak: across 3-year stretches it came out slightly ahead more often." |
| `marginal` from spread only | "Dates in this fund have differed by up to {spreadPp} pp, but not consistently. The {nth} came out slightly ahead in your window; the pattern may not hold." |
| `marginal` from stability only | "The {nth} has come out slightly ahead in your window fairly consistently, but by very little: {edgePp} pp of XIRR." |
| `meaningful`, `edgePp > 0.005` | "In this fund the {nth} has come out ahead of the other dates in your window: +{edgePp} pp of XIRR over {years} years." |

Lines that sit around the headline:
- **Noise caveat.** When `metricsAgree` is false and the verdict isn't noise, add under the
  headline: "The date with the highest XIRR and the date with the highest final value
  differ here, which points to noise."
- **Rupee line** (always shown), for Kotak: "For a notional ₹10,000 monthly SIP, the
  highest- and lowest-value dates (the 1st and 20th) ended ₹60,869 apart on ₹16.4 lakh
  invested, 0.8% of final value, over 13.7 years."

**Missed instalment.** The spec claims "one bounced instalment costs more than the entire
date spread". Asserted universally, that isn't safe. Kotak's instalments are each worth
₹9,856–₹1,61,228 today, with a median of ₹40,159, and 40 of them are individually worth more
than the full ₹60,869 spread.

The honest comparison is sharper anyway, so "What actually matters" shows:
- choosing the 12th over a typical date in your window was worth about **₹63** over 13.7
  years
- one missed instalment is ₹10,000 not invested, worth ~₹46,000 today *on average*
- the range across instalments, so the average isn't read as a guarantee

**Wording.** No "best", "recommended", "safe" (next to investing it reads as risk-free),
"real advantage" or "winner" in UI copy, titles or og tags. A test enforces this (§11).

### Data source and operations

#### D8 — Two departures in how data is fetched

- **Scheme list.** Use `GET /mf/latest` instead of `GET /mf`. It's one 800 KB request that
  also returns house, type, category and latest NAV date for all 37,882 schemes. That
  gives liveness and scheme type without extra calls.
- **Cache.** Store parsed rows per scheme, keyed by latest NAV date as the spec says. When
  the date moves, fetch only the recent tail (`?startDate=` latest date minus 10 days) and
  merge it; do a full refresh weekly. Caching the raw full response instead would force
  re-downloading every history every night.

Retries follow the spec: 3 retries, so 4 attempts.

#### D9 — Nightly schedule time and where data commits go

- **Time.** 20:30 UTC is 02:00 IST. That's *before* mfapi's 03:09 and 05:05 IST refreshes,
  so some late-reporting funds would lag a day. **Recommendation:** `30 0 * * *` (06:00
  IST). It's off the top of the hour, which also avoids GitHub's peak queue delays.
- **Where commits go.** Commit to `main`. At ~980 funds that's about 0.8 MB of growth per
  night, roughly 0.3 GB a year. Revisit if the repo passes 1 GB; the fix is an orphan
  `data` branch that gets squashed.

### Motion

#### D10 — Motion: five conflicts in §8

- **(a) `layoutId` needs `domMax`, not `domAnimation`.**
  - Under `domAnimation`, `layoutId` silently does nothing; I confirmed this in a browser.
  - `domMax` costs 28 KB gzipped versus 14 KB and would push total JS to roughly 187 KB,
    over budget.
  - **Recommendation:** implement the one search-to-grid morph as a hand-written FLIP on
    WAAPI: one measurement, then a single `transform` + `opacity` animation. Keep
    `domAnimation`. This departs from rule 5's wording but keeps its intent.
- **(b) The answer spring.** The spec's spring (stiffness 400, damping 30, mass 0.8) peaks
  at 1.0016, not 1.06.
  - Motion can't express `[0.8, 1.06, 1]` as one true spring. With separate `scale` keys
    the middle frame is dropped; with a `transform` string all three frames share one
    easing curve.
  - My first fix (damping 13) settles at ~950 ms and breaks the 700 ms cap.
  - **Recommendation:** answer cell only, a 2-keyframe `scale(0.8) → scale(1)` spring with
    **stiffness 1600, damping 26, mass 0.8**. Simulated: peaks at 1.059 and settles in
    ~290 ms, so it ends by ~690 ms.
  - Everything else keeps the spec's spring. A unit test asserts every step ends by 700 ms.
- **(c) Cold deep links and back/forward render the final state instantly.**
  - There's no search result to morph from.
  - Entrance animations would delay LCP.
  - `navigator.vibrate` needs a user gesture.

  The sequence plays only on selection inside the app.
- **(d) Drop the "date numeral counts up" step.**
  - Counting up flashes wrong dates.
  - The concrete date has to be visible within 150 ms (criterion 1).
  - The answer cell's spring landing is already the reveal.

  Alternative: count up a decorative copy of the numeral while the real heading stays
  static.
- **(e) The landing page has no grid.** The card is created by the morph on first selection
  and then persists. Choosing another fund while a card is on screen skips the morph and
  the cell fade-in, and plays only the window wave, answer landing and ticker. A grid
  that's already visible doesn't blink.

#### D11 — What criterion 7 ("no frame over 8.33 ms") measures

Headless Chromium doesn't render at 120 Hz, and DevTools' Frame Rendering Stats overlay
can't be automated.

**Recommendation:**
- **Automated gate.** A CDP trace in which no frame's main-thread work exceeds 8.33 ms at 1×
  CPU, with zero dropped frames during 0–700 ms. A 4× CPU run is reported alongside.
- **Final sign-off.** Your trace or Frame Rendering Stats on a real 120 Hz device (Phase 6).

### Hosting and performance

#### D12 — Three spec hosting items don't work on Cloudflare as written

> **Superseded by D20 (2026-09-16):** the site runs on Cloudflare Workers static assets, not
> Pages. The Cloudflare behaviours described below are still accurate, and the og-tags
> decision still stands. Only the product changed.

Verified locally with `wrangler pages dev`, which uses Pages' routing code. Parity with
production gets confirmed at Phase 1 (D19).

- **`_redirects` with `/* /index.html 200` is rejected** as an infinite loop and ignored.
  Pages already serves `index.html` for unknown paths when there's no top-level `404.html`.
  **Ship no `_redirects`.**
- **Immutable caching on `/data/funds/{code}.json` pins users to stale data for a year.** The
  file changes nightly under the same URL. Worse, a *missing* fund file returns `index.html`
  with 200 **and** the immutable header.
  - Fetch `/data/funds/{code}.json?v={dataVersion}`, with `dataVersion` baked into the HTML
    at build time.
  - ~~The build writes `dist/data/404.html` so missing data returns a real 404.~~ Pages-only,
    and dropped under D20: Workers ignores a nested 404.html, so the data path carries the
    version instead.
  - The client also checks `content-type`.
- **Client-side og: tags are invisible to link previews.** WhatsApp, Slack, X and LinkedIn
  crawlers read raw HTML. That's documented by Facebook and Slack and widely reported for
  the others.
  - The build writes `dist/f/{code}.html` for every fund, holding its title, og tags, a
    prerendered page and the fund JSON inlined.
  - Pages serves that file at `/f/{code}` with no redirect.
  - This is build-time generation only; there's no server runtime. About 2,000 files, well
    under Pages' 20,000 limit.
  - Hydration details are in §6.2.

#### D20 — Hosting pivot to Workers static assets (supersedes D12's product choice)

Decided 2026-09-16. The dashboard's Git import creates Workers projects, the Pages flow
proved hard to reach, and Cloudflare directs its investment at Workers. The site is live at
`sip-date-planner.kulkarniakshay1989.workers.dev`, built by Workers Builds from this repo.

**What stays the same**
- `wrangler.jsonc` has no `main`, so no server code runs. Still a static site, still no
  backend.
- `_headers` is honoured. Verified on the live Worker and with `wrangler dev`.
- `/f/{code}` falls back to the shell, so deep links work without a `_redirects` file.
- Per-fund HTML for og tags still works: an exact file match wins over the fallback.

**What changes**
- **A missing `/data/**.json` returns the shell with a 200**, plus whatever cache header
  matched, where Pages returned a 404. Measured on the live Worker:
  `content-type: text/html` with `max-age=31536000, immutable`.
- **Fund data moves to a versioned path**, `/data/{dataVersion}/funds/{code}.json`, instead
  of a `?v=` query on a stable URL. A wrong code can still be cached, but only under a
  version the next nightly build retires, rather than for a year.
- The client treating a non-JSON content type as "not covered" (§6.2) becomes the primary
  guard rather than a backstop.
- `scripts/write-static.ts` and its nested `data/404.html` are gone, since Workers ignores
  them.
- e2e hosting tests run against `wrangler dev` instead of `wrangler pages dev`.

**Cost accepted:** an unknown fund code is a 200 with HTML rather than a 404. Nothing else
in the plan depends on that 404.

#### D21 — Rules added while fixing the Phase 3 review (2026-09-16)

An independent review of the pipeline and an audit of the published data found defects that
changed published numbers. These are the fixes. Two items at the end are yours.

**History cleaning, before any analysis**
- A single print that jumps 25% or more and comes straight back is dropped: 21.71 → 70.53 →
  21.54 is a typo, not three days of trading. Left in, it buys units at a price that never
  existed and looks like a re-denomination to the rule below.
- The cut for a re-denomination is **400%**, not 50%. Real cases are around 100×; the lower
  threshold cost real funds up to seven years of history over a single violent day.
- The history is also cut at an internal hole longer than **60 days**. One fund carries a
  705-day gap that was being treated as one day-over-day step.
- A fund whose history was cut publishes `trimmedFrom` and is always **reduced** confidence.
  Otherwise the page presents a truncated series as the fund's whole life.

**Eligibility**
- **37 months**, not 36. A fund with exactly 36 months produces no rolling window at all, so
  it would be graded on spread alone with no robustness behind it; nine such funds had been
  published as "marginal".
- **ETF fund-of-funds are kept.** They're ordinary open-ended schemes you can SIP with the
  AMC, and the ETF rule was dropping them, along with one liquid FoF.
- **Target maturity** now also catches issuer-basket funds carrying a maturity year without
  bond or SDL wording: IBX, AAA, NBFC, HFC.

**Correctness**
- `metricsAgree` is computed from the rounded values the artifact publishes, so the flag
  can't contradict the numbers on screen.
- The cache tail is anchored to the **cached** newest day, not the newest day upstream. A
  cache staler than the tail window is refetched whole, which doubles as the periodic full
  refresh. Rows that upstream withdraws are dropped instead of living in the cache for ever.
- Partial runs (`--codes`, `--limit`) require an explicit `--out` and never touch the real
  `meta.json`, whose `fundCount` is the baseline for the next run's drop guard.
- `--as-of` fixes the whole run, the scheme list included, so a run is reproducible.
- The writer validates and size-checks before writing anything, renames index and meta into
  place, and `keepVersions` counts every version retained, the new one included (default 3).

**Deferred, with a home**
- Three pairs of funds share a display name in `index.json` (119588/119589, 119767/133035,
  135762/135764). That's a search problem: Phase 4 shows house and category, and the scheme
  code where names still collide.
- A fund's own `navTo` can be older than the site-wide `navAsOf`; Phase 5 renders the fund's
  own date on its page.

**Needs your decision**
- `spreadPp > 0.25` is an absolute threshold on a max-minus-min of 28 estimates whose noise
  shrinks as history grows, so the verdict partly grades history length. Median spread is
  0.508 pp for funds with 36–47 instalments and 0.062 pp past 150; every "meaningful" fund
  has 103 instalments or fewer, and none of the 432 funds with 150 or more is meaningful.
  This isn't an engine bug — a constant-rate synthetic NAV gives exactly 0.000 — and
  CLAUDE.md freezes the thresholds, so it stays as specified unless you decide otherwise.

#### D13 — Lighthouse target

Spec §9 says "95+, CI fails below 90".

**Recommendation:**
- Fail below 0.90, warn below 0.95, and report the score at each gate.
- Take the median of 3 runs per URL (`/` and `/f/119775`) to damp runner noise.
- Assert LCP ≤ 1200 ms and CLS = 0.

### Fonts, design and compliance

#### D14 — The font licence forbids two spec instructions

Fontshare's ITF Free Font License 2.0 ships inside the zips, dated 17 Aug 2026:
- **Allows** self-hosting woff2 files on our site.
- **Forbids** subsetting and format conversion without ITF's written consent.
- **Forbids** redistribution via a public repository. This repo is public and GPL-3.0.

**Recommendation:**
- **Fetching.** A `fonts:fetch` build step downloads the official woff2 files by pinned URL
  and verifies SHA-256 hashes, with retries.
  - The files are gitignored and cached in Actions by hash.
  - A hash mismatch fails loudly.
- **Payload.** Fonts stay unsubset: Cabinet Grotesk 700 (20.3 KB) plus Satoshi Variable
  (42.6 KB), 63 KB total. If you get ITF's consent, subsetting cuts that to about 31 KB.
- **No tabular figures in Cabinet Grotesk.** Grid numerals sit centred in fixed-size cells.
- **No ₹ glyph in Satoshi.** A `unicode-range` face borrows ₹ from the Cabinet file at no
  extra cost.
  - Risk: it may look heavier next to Satoshi 400. I'll check it in a zoomed Phase 5
    screenshot.
  - Fallback: switch to Cabinet Variable (+21.6 KB).

#### D15 — Contrast fixes (two colours added, none changed)

| Pair | Ratio | Result |
|---|---|---|
| White on marigold | 2.04:1 | fails |
| Ink on marigold | 7.91:1 | passes |
| `--mute` text on surface | 3.21:1 | fails AA, and it's the colour of the disclaimer and `navAsOf` |

**Recommendation:**
- The answer numeral is ink on marigold, with a static 2 px ink ring.
- Window numerals are white on teal (5.01:1).
- Add `--mute-text: #626B80` (4.68:1) for small text. Keep `#7C8699` for non-text marks.
- Add a 1 px border on raised cards, since white on surface is only 1.14:1.

#### D16 — Compliance additions (not legal advice)

- **Footer.** Keep your footer and add: "Not a recommendation to buy, sell or hold any
  scheme. Not registered with SEBI. Not affiliated with AMFI, mfapi.in or any fund house."
  Show `navAsOf` alongside it.
- **Legal risk.** AMFI's website terms limit its content to personal, non-commercial use
  and prohibit publicly displaying derivative works. mfapi.in publishes no terms. Please
  have an Indian securities/IP lawyer review this before public launch. It doesn't block
  building.

#### D17 — Criterion 2: which XIRR values count as "known Excel values"

No Excel runs on this machine.

**Values Excel itself produced (5):**
- Microsoft's documented example (0.37336)
- TechOnTheNet examples 1 and 2 (2.66024, 2.18631), from Excel screenshots
- ExcelJet (0.0788)
- a −13.42% series whose Excel output a user posted on Microsoft Q&A; that's community-
  reported, and it's the only Excel-produced negative I found

**Mathematically exact values, not run through Excel:**
- the −80% and −95% series
- Google's −64% example
- the SIP fixtures

These are cross-checked four ways (float bisection, Brent's method, 60-digit decimal,
pyxirr).

**Recommendation:**
- The five Excel-produced values are criterion 2's fixtures.
- The exact series are extra tests.
- The spec asks for a "deeply negative" *Excel* value. Either run the −80% series through
  real Excel and send me the result, or accept the exact root.

#### D18 — Dependencies and component choices

- **Tooling (devDependencies).**
  - `tsx`, to run the TypeScript pipeline
  - `size-limit` + `@size-limit/file`
  - `@lhci/cli`
  - `wrangler`, dev only, for Pages-parity routing tests
  - `@types/node`
- **Versions.** `vitest` pinned to 5.0.x, the version actually run against Vite 6.4.3.
- **Brought in by shadcn.**
  - `radix-ui`.
  - `cn`, imported as `cn/lite`: 0.2 KB instead of 10.7 KB. The trade-off is that lite
    doesn't resolve conflicting Tailwind classes, so components never override a default
    utility via `className`. A test covers this.
- **Bundle-saving choices.**
  - Native `<select>` for salary and buffer, instead of Radix Select.
  - Inline SVG icons, instead of `lucide-react`.
- **Local setup.** This Mac has no pnpm. I'd run `corepack enable pnpm`, which adds global
  shims. Say if you'd prefer Homebrew.
- **pnpm pinning.** `packageManager` is pinned exactly (`pnpm@10.34.5`); Cloudflare's
  preinstalled pnpm switches to it. `onlyBuiltDependencies` covers esbuild and workerd.

#### D19 — Connect Cloudflare at Phase 1, not Phase 8 — done

Deploying only at the last phase would hide the risks in the real build: pnpm switching,
`fonts:fetch`, thousands of prerendered files, production routing.

**Done 2026-09-16.** The repo is connected to Workers Builds (D20), production and preview
URLs are live, and the build runs on every push. One piece of tidying remains: an earlier
stray Worker named `datadrivensip` has no config, so it fails on every pull request and
should be deleted.

---

## 1. What the research established

| Area | Finding | Report |
|---|---|---|
| Criterion 3 | Reproduced under one convention set; independent re-implementation matched 28/28 rows | 01, 02 |
| Stability | Kotak 0.5446 under the pinned rule; ~0.51–0.67 across month-set and split variants | 01 |
| Short history | 151713 (40 months): 5 windows, "marginal" via spread; ≤36 months: 0 windows | 01, 03 |
| Engine cost | ~220 ms per fund single-threaded → ~4 min for ~1,000 funds, ~1 min on 4 workers | 01 |
| XIRR | 15 fixtures; spec bisection matches all to 4 dp; 5 no-root cases need an explicit sign check | 04 |
| mfapi | `/mf/latest` covers all schemes in one request; unknown codes return 200 with empty data; no rate-limit headers | 03 |
| Cold fetch | ~1,760 histories, 17.6 MB gzipped, ~9 s at 64 ms latency; >8× inside budget even at 1 s | 03 |
| Stack | Latest majors are past the spec (Vite 8, Motion 13, RR 8, TS 7); pinned within spec majors (§2) | 05 |
| Bundle | Isolated probes summed; one full trivial build came to 143 KB initial / 172.5 KB total (§9) | 05 |
| Motion | `layoutId` needs `domMax`; `x/y/scale` keys run on the main thread; `opacity` and `transform` strings go to WAAPI; springs compile to CSS `linear()`; `reducedMotion="user"` still animates opacity; Motion doesn't manage `will-change` | 05 |
| Hosting | Verified locally: `_redirects` rule rejected, missing JSON cached as HTML, flat `f/{code}.html` served without redirect, overlapping `Cache-Control` rules comma-joined | 06 |
| Throttling | "Fast 3G" was renamed "Slow 4G"; it is Lighthouse's default mobile profile | 06 |
| Fonts | Licence facts in D14; no `tnum` in Cabinet; no ₹ in Satoshi; kerning breaks Satoshi's tabular digits unless disabled | 07 |
| Critique | 17 engineering blockers and 41 product items; adopted except where §15 lists them as open | 08, 09 |
| Plan review | 3 reviewers, ~58 findings; all addressed in this revision | — |

---

## 2. Architecture

```
          nightly GitHub Action (00:30 UTC, D9)                Cloudflare Workers
┌──────────────────────────────────────────────┐  git push   ┌─────────────────────────┐
│ pipeline/                                     │ ──────────▶ │ pnpm build               │
│  sources/mfapi ─▶ eligibility ─▶ fetch+cache  │             │  fonts:fetch (FFL)       │
│        ─▶ workers: analysis/ (pure) ─▶ write  │             │  vite build              │
│  public/data/{index,meta}.json, funds/*.json  │             │  prerender f/{code}.html │
└──────────────────────────────────────────────┘             └────────────┬────────────┘
                                                                           │ static files
                                                              ┌────────────▼────────────┐
                                                              │ browser: React SPA       │
                                                              │  1 fund JSON (inline)    │
                                                              │  picks date in window    │
                                                              └─────────────────────────┘
```

Repo layout:

```
/pipeline
  analysis/        pure engine: nav.ts xirr.ts simulate.ts rolling.ts stability.ts
                   verdict.ts analyse.ts (+ *.test.ts next to each)
  sources/         NavSource interface, mfapi.ts, fixture.ts, (later) amfi-navall.ts
  eligibility.ts  fetch.ts  cache.ts  worker.ts  write.ts  validate.ts
  cli.ts           `pnpm pipeline` (--limit, --full, --codes, --as-of, --source fixture)
  fixtures/        119775.nav.json, 151713.nav.json, xirr-fixtures.json (frozen)
/shared            artifact types (FundArtifact, IndexRow, Meta), types only
/src
  entry-client.tsx  entry-prerender.tsx  app.tsx  routes/{layout,home,fund}.tsx
  lib/             window.ts answer.ts copy.ts format.ts search.ts data.ts url.ts
                   sequence.ts (motion controller)
  components/      hero-grid/, answer-copy, salary-control, disclosures/ (lazy),
                   curve-chart (lazy uPlot), footer, ui/ (shadcn, motion-cleaned)
  styles/          index.css (@theme tokens, @font-face)
/scripts           fonts-fetch.ts, prerender.ts, size-config.ts, check-rules.ts
/public            _headers, data/ (pipeline output), fonts/ (gitignored)
/e2e               Playwright specs, perf harness, fixtures/data (frozen + synthetic)
/docs/research     phase-0 reports
```

Pinned versions, measured working together on 2026-09-15:

| Package | Version | Note |
|---|---|---|
| vite | 6.4.3 | last Vite 6 |
| @vitejs/plugin-react | 5.2.0 | last line supporting Vite 6 |
| react / react-dom | 19.3.0 | |
| typescript | 5.9.3 | strict |
| tailwindcss / @tailwindcss/vite | 4.3.3 | |
| shadcn (CLI) | 4.21.0 | `-t vite -b radix`; motion utilities stripped |
| cmdk | 1.1.1 | brings @radix-ui/react-dialog (counted in the bundle) |
| motion | 12.43.0 | |
| react-router | 7.18.3 | declarative, no framework plugin |
| uplot | 1.6.32 | |
| vitest | 5.0.x | ran against Vite 6.4.3 |
| @playwright/test | 1.63.0 | |
| pnpm | 10.34.5 | exact `packageManager` |
| Node | 22 | `.node-version`; no env vars on Pages |

---

## 3. Data pipeline

`pnpm pipeline` runs `tsx pipeline/cli.ts`. Only `cli.ts`, `sources/`, `fetch.ts`,
`cache.ts` and `write.ts` do I/O or read the clock. "Today" is resolved once, in
Asia/Kolkata, and passed down as a day number. `--as-of YYYY-MM-DD` truncates NAVs and sets
"today", which makes criterion 3 reproducible through the whole pipeline.

### 3.1 Source interface

```ts
interface NavSource {
  listSchemes(): Promise<SchemeSummary[]>;   // code, name, house, type, category, latestDate
  history(code: number, since?: DayNum): Promise<NavRow[] | null>; // null = not found
}
```

- **`mfapi`.** Uses `/mf/latest` for the scheme list (D8), plus `/mf/{code}` and
  `?startDate=` for histories. An empty `data` array or `meta.scheme_code === 0` means
  **not found**.
- **`fixture`.** Reads `pipeline/fixtures/`, for tests and the criterion-3 run.
- **`amfi-navall`.** Can be added later behind the same interface.

### 3.2 Eligibility (per D4)

These run in order and log each count:
1. The name contains `Direct`, matches `/growth/i`, and doesn't match
   `/IDCW|dividend(?! yield)|payout|reinvest|bonus|unclaim/i`.
2. `scheme_type === "Open Ended Schemes"`; not an ETF, unless it's a fund of funds;
   target-maturity and overnight/liquid funds per your D4 choice (D21).
3. The latest non-zero NAV is within 12 days of today.
4. After fetching:
   - zero NAVs are dropped, and single bad prints are removed (D21)
   - the history is cut at a re-denomination, or at a hole longer than 60 days (D21)
   - flat NAVs are rejected
   - `addMonths(navFrom, 37) <= navTo`, so every published fund has at least one rolling
     window

### 3.3 Fetch and cache

- **Fetching.** A concurrency pool of 12. On 429, 5xx and network errors: 3 retries with
  0.5, 1 and 2 s backoff.
- **Cache.** `pipeline/.cache/{code}.json` holds `{ latestDate, rows }` and is gitignored.
  - If the date from `/mf/latest` equals `latestDate`, skip the fetch.
  - Otherwise fetch from `latestDate − 10 days` and merge. If overlapping rows disagree,
    fetch the full history.
  - A full refresh runs weekly or with `--full`.
- **Cost.** A cold run is ~1,760 requests (~10 s to 2.5 min). Actions keeps the cache warm
  with `actions/cache`.

### 3.4 Analysis and writing

- A `worker_threads` pool sized to available CPUs runs `analyse()` per fund.
- Output goes to a temp directory, is validated, then swapped in one step into
  `public/data/{funds,index.json,meta.json}`.
- Funds no longer eligible are pruned; a deep link to one shows a "not covered" state.
- **Validation:**
  - every fund file passes a hand-written schema check (finite numbers, 28 dates, enums)
    and is < 2 KB gzipped
  - `index.json` is < 120 KB gzipped
  - fund count is within 10% of the committed `meta.json` and inside 800–1,600

  Any failure exits non-zero and writes nothing.

---

## 4. Analysis engine — exact conventions

Pure TypeScript, no I/O, no clock. Dates are integer UTC day numbers (`DayNum`). Tests are
written first (§12). These rules reproduce criterion 3 and were confirmed independently.

**Parsing.** Rows are `DD-MM-YYYY`. Drop NAVs that are unparseable or ≤ 0. Sort ascending.
`navFrom` and `navTo` are the first and last rows.

**`navOnOrAfter(nav, day)`.** Check `day+0` through `day+7`; return the first date with a
NAV, else `null`. Never backward, never interpolated.

**XIRR.**
- Sort flows by date. `t0` is the earliest date; `years = (t − t0) / 365`.
- Return `{ rate: null, reason }` in any of these cases:
  - fewer than 2 flows
  - no positive flow or no negative flow
  - NPV isn't finite at a bracket end
  - NPV has the same sign at −0.99 and 3.0
- Otherwise run 100 bisection iterations on [−0.99, 3.0].
  - Compare `sign(f(mid))` with the cached `sign(f(lo))`. Never assume NPV is decreasing.
  - If `f(mid) === 0`, return `mid`; otherwise return `(lo + hi) / 2` at the end.
- Newton-Raphson is never used.

**One SIP.**
- Invest ₹10,000 per instalment; units = 10000 / nav, kept fractional.
- Each flow is dated at the **NAV date actually used**, not the target calendar date.
- The terminal flow is units × NAV on the terminal date.

**Per-date month rule** (XIRR and everything that ranks by XIRR).
- For each d in 1..28, walk the calendar months from `month(navFrom)` to `month(navTo)`.
- Include month m if the target date `(y, m, d)` is ≥ `navFrom` and `navOnOrAfter(target)`
  isn't null.
- The terminal date is `navTo`.

**Common month set** (`corpus`, `spreadRupees`, `metricsAgree`, `instalments`; D1).
- Use the months where `navOnOrAfter` is non-null for all 28 dates, with no `navFrom` guard:
  a 1 Jan 2013 target buys on the 3rd.
- Same terminal date as above.
- For Kotak this is Jan 2013–Aug 2026, 164 months, so `instalments` = 164.

**Rolling 3-year windows.**
- Month M qualifies when the 1st of M is ≥ `navFrom` and the 1st of M+36 is ≤ `navTo`.
  Kotak has 128 windows.
- Every date invests in months M..M+35 under the per-date rule.
- The terminal date is `navOnOrAfter(1st of M+36)`, the same for all dates.
- If that terminal is null, or any XIRR in the window is null, drop the window and log it.
- Rank the 28 XIRRs descending (1 = best), giving exact ties their average rank.
- `pct = (28 − r) / 27 × 100`.
- **Tie credit.** A tie group of size k covering positions p..p+k−1 gives each member
  (positions in the group ≤ threshold) / k. Used for `topQ` (threshold 7) and `w`
  (threshold 1).
- Per date:
  - `meanPct` = mean of `pct`
  - `topQ` = mean top-quartile credit
  - `w` = sum of rank-1 credit, which feeds the "winner counts" in §6.5
- With 0 windows: `meanPct` and `topQ` are null, and `w` is 0.

**Split-half stability.**
- With N NAV rows and h = ⌊N/2⌋, half A is `rows[0..h−1]` and half B is `rows[h..N−1]`.
- Run the per-date full-history simulation on each half as if it were the whole history.
- Stability = Pearson correlation of the two average-rank vectors (Spearman).
- Null if either vector has zero variance or any XIRR is null.

**Spread and agreement.**
- `spreadPp` = max − min of unrounded XIRR %, then rounded.
- `spreadRupees` = round(max − min common-set corpus).
- `metricsAgree` = (argmax XIRR date === argmax corpus date), taking the lowest d on ties.

**Verdict.** The spec formula, applied to the 3-dp stored values. A null stability never
counts as > 0.60. The thresholds are frozen.

**Confidence (D5).** `"reduced"` when there are < 24 windows or either half has < 24
instalments.

**Rounding.** All floats to 3 dp, half away from zero, so a negative stability rounds like
its positive mirror. `corpus` and `spreadRupees` are integers. `spreadPp` and `spreadRupees`
are differences of unrounded values, rounded once at the end.

**Details settled during Phase 2.** A clean-room re-implementation from this section alone
matched the engine on every number, but had to guess these, so they're written down:

- Months stop naturally: a target past the last NAV simply has no NAV within seven days.
  There's no separate upper bound.
- Ties are exact equality of the unrounded rates, not of the 3 dp values.
- `meanPct` and `topQ` average over the windows that were kept, not over every candidate.
- A half's instalment count, for confidence, is the smallest across the 28 dates in that half.
- When a date appears twice in the source, the first row wins.
- A fund with no month common to all 28 dates is an error, not an artifact of zeroes.

**Kotak snapshot** (NAVs to 2026-09-11):

| Quantity | Value |
|---|---|
| Highest XIRR | 26th, 20.389 |
| Lowest XIRR | 9th, 20.276 |
| `spreadPp` | 0.114 |
| `stability` | 0.545 |
| Windows | 128 |
| Verdict | noise |
| Highest-value date (common set) | 1st |
| Lowest-value date (common set) | 20th |
| `spreadRupees` | 60,869 |

The runtime pick (§6.4) is the **12th** for window 3–12 (`meanPct` 58.9). With
`salary=15`, the window is 17–26 and the pick is the **25th** (86.1), which satisfies
criterion 4.

---

## 5. Artifacts

### `public/data/funds/{code}.json`

The spec's shape, plus `windows`, `confidence` and per-date `w`:

```jsonc
{
  "code": 119775, "name": "Kotak Mid Cap Fund - Direct Plan - Growth",
  "house": "Kotak Mahindra Mutual Fund", "category": "Equity Schemes - Mid Cap Fund",
  "navFrom": "2013-01-03", "navTo": "2026-09-11", "instalments": 164,
  "dates": [{ "d": 1, "xirr": 20.304, "corpus": 7569425, "meanPct": 35.8, "topQ": 0.125, "w": 3 }],
  "spreadPp": 0.114, "spreadRupees": 60869, "stability": 0.545,
  "metricsAgree": false, "verdict": "noise", "windows": 128, "confidence": "full"
}
```

`meanPct` appears here to 1 dp only to keep the line short; the file stores 3 dp.

### `index.json`

`[[code, name, house, category], ...]` in scheme-code order, never ordered by any metric.
About 16 KB gzipped.

### `meta.json`

`{ builtAt, fundCount, navAsOf, pipelineVersion, dataVersion, source }`.
- `navAsOf` is the most common latest-NAV date across included funds.
- `dataVersion` is `navAsOf` plus a short content hash.
- `source` is `"mfapi.in"`; the footer reads it rather than hard-coding the name.

---

## 6. Runtime app

### 6.1 Routes and URL state

- **Routes.** `/` and `/f/:code` share a persistent layout route, so the search field and
  hero card never remount.
- **Params.** `salary` (`last` | 1–31) and `buffer` (0–7).
  - Defaults are left out of the URL; invalid values are clamped.
  - Choosing a fund pushes a history entry; changing salary or buffer replaces it.
- **State.** No global store. State comes from `useParams`, `useSearchParams` and a
  module-level `Map` of fetched fund JSON.

### 6.2 Prerender, hydration, and data loading

**At build.** `vite build --ssr src/entry-prerender.tsx` writes to `.prerender/`, outside
`dist`. `scripts/prerender.ts` then generates:
- `dist/index.html`
- one `dist/f/{code}.html` per fund, containing:
  - title and og tags
  - `<script type="application/json" id="fund">`
  - `data-version`
  - page markup rendered with **default** params

**On load (`entry-client.tsx`).**
- **Prerendered path with default params:** `hydrateRoot`, reading the inline JSON with no
  fetch.
- **Non-default params** (`?salary=15`):
  - A ~300 B inline head script sets `data-params-pending` before first paint.
  - CSS sets `visibility: hidden` on the answer overlays and answer copy. Layout is kept,
    so no wrong date flashes and nothing shifts.
  - `createRoot` then renders the correct state from scratch, so there's no hydration
    mismatch.
- **Unprerendered path** (an unknown `/f/x` served as `index.html`): `createRoot`, then
  the "not covered" state.

**Rules for all prerendered components.**
- Cold renders use `initial={false}`, so the server HTML already carries final styles; no
  cells sit at opacity 0.
- Clock-dependent UI, such as the stale-data notice, renders only after mount.
- Nothing reads `window` during render.

**In-app navigation.**
- Fetches `/data/funds/{code}.json?v={dataVersion}`.
- A response that isn't OK or isn't JSON shows the "not covered" state.
- A `navAsOf` more than 7 calendar days old shows a quiet notice.
  - Kotak's own history has 5–6 day NAV gaps around holidays, so a shorter threshold would
    raise false alarms.

### 6.3 Typeahead

- **Component.** shadcn `Command`, built on cmdk, with `shouldFilter={false}`; we score and
  cap at 8 results.
  - The `<input>` is always our own mounted element, so early keystrokes, focus and caret
    survive.
  - The cmdk chunk supplies the list and keyboard handling. It preloads on idle after
    hydration.
- **Loading.** `index.json` loads on the **first keystroke in the field**. The `/` shortcut
  only focuses the field; it's ignored while typing elsewhere or when a modifier key is
  held.
- **Scorer.**
  - Tokenise on `[a-z0-9&]+`, ignoring plan words (direct, plan, growth, option, fund).
  - Query tokens prefix-match name or house tokens, in order.
  - Earlier position and shorter names score higher.
  - **Fuzzy fallback:** when fewer than 8 results match, allow one typo per token of 4+
    letters (Damerau distance 1). "kotk mid" still finds Kotak Mid Cap.
  - Results are ordered by text relevance only.
  - "kotak mid" puts 119775 above 120158 (Kotak Large & Mid Cap).
- **Enter and debounce.**
  - The debounce is 120 ms; Enter flushes it and selects the highlighted row, which is the
    top hit by default.
  - If the index is still loading, Enter waits for it.
- **Prefetch.** The highlighted hit's JSON is prefetched whenever the highlight or the
  results change. That covers touch devices, which have no hover.
- **Rows.** Line 1 is the name; line 2 is the house, then the category. No middle dots.

### 6.4 Answer

- **Safe window.** `window.ts` implements D6.
- **Pick (`answer.ts`).**
  - Candidates are the window's dates.
  - Sort by `meanPct` desc, then `topQ` desc, then XIRR desc, then window order (the first
    date after salary).
  - With 0 windows, sort by XIRR desc, then window order.
  - A property test proves the pick is always inside the window.
- **Copy.** `copy.ts` implements the D7 table.
  - The answer heading ("The 12th") is plain text, always at full opacity, and never
    animated.
  - Rupee amounts use `Intl.NumberFormat('en-IN')`; invested amounts use "lakh" wording.
  - Ordinals come from `Intl.PluralRules` with `type: 'ordinal'`.
- **Controls, below the answer.**
  - A native `<select>` for salary: "Last working day", then 1st–31st.
  - An "Adjust buffer" disclosure holding a native `<select>` for 0–7.

### 6.5 Disclosure sections (lazy chunk, collapsed by default)

Radix Collapsible doesn't render closed content at all, which is stronger than
`content-visibility`. Open section bodies get `content-visibility: auto` with
`contain-intrinsic-size: auto 480px`, plus padding so focus rings aren't clipped.

1. **The full curve.** A uPlot bar chart, lazy-loaded.
   - The y-axis is zoomed to the data, with a caption: "Top to bottom of this chart is
     0.11 percentage points."
   - Window bars are teal, the answer marigold, with text labels so colour isn't the only
     cue.
2. **How confident is this?**
   - `stability` in plain words, with the scale explained
   - the answer's `topQ` against the 25% you'd expect by chance
   - how often each date led (`w`)
   - the `metricsAgree` statement when false
   - the reduced-confidence explanation when it applies
3. **What actually matters.** From this fund's own numbers (D7):
   - the in-window edge in ₹
   - one missed instalment: ₹10,000 not invested, plus its average and range of value today
   - the never-outside-your-window statement

### 6.6 Head tags and accessibility

- Title and og tags come from prerendered HTML and update on client navigation.
  `lang="en-IN"`.
- The grid is `aria-hidden`, with a screen-reader summary: "Your window: 3rd to 12th.
  Your date: the 12th."
- After a selection, focus moves to the answer heading. One polite live region announces
  salary changes.
- The rupee ticker is `aria-hidden`; its final value is always in the DOM.
- **States:**
  - index loading or failed
  - no results
  - fund loading (grid space reserved)
  - not covered
  - stale data
  - chart chunk failed
  - offline

---

## 7. Visual design

### Hero grid

- **Layout.** 7 columns × 4 rows, read like a calendar.
  - At 360 px wide, cells are ~42 px with 6 px gaps and the grid is ~185 px tall.
  - On desktop, cells are ~64 px.
  - The height is reserved.
- **Numerals.** Cabinet Grotesk 700, centred in fixed cells.
- **Cell states.**

  | State | Look |
  |---|---|
  | Neutral | ink on raised |
  | Window | teal overlay, white numeral |
  | Answer | marigold overlay, ink numeral, ink ring |

  Every fill is a pre-painted overlay, so motion only ever animates opacity.

### Landing, before any fund is chosen

The page shows the question as the H1 ("Which date should I run my SIP on?"), the search
field, and one quiet line about honesty. No grid, no demo fund (D10e).

### Sketch (mobile, after selecting Kotak)

```
Which date should I run my SIP on?
[ Search a fund                        / ]

Kotak Mid Cap Fund - Direct Plan - Growth
Kotak Mahindra Mutual Fund
┌──────────────────────────────────────┐
│  1    2   ▓3   ▓4   ▓5   ▓6   ▓7     │  ▓ your window (teal)
│ ▓8   ▓9  ▓10  ▓11  ◉12   13   14     │  ◉ your date (marigold, ink ring)
│ 15   16   17   18   19   20   21     │
│ 22   23   24   25   26   27   28     │
└──────────────────────────────────────┘
The 12th
Any date in your window has done about the same in this fund.
The 12th is a tiebreak: across 3-year stretches it came out
slightly ahead more often.
For a notional ₹10,000 monthly SIP, the highest- and lowest-value
dates (the 1st and 20th) ended ₹60,869 apart on ₹16.4 lakh
invested, 0.8% of final value, over 13.7 years.

Salary arrives   [ Last working day  v ]      Adjust buffer
> The full curve
> How confident is this?
> What actually matters

NAVs up to 11 September 2026.
Educational tool. Not investment advice. ...
```

### Tokens

Tailwind v4 `@theme` holds your six colours plus `--mute-text` and a `--line` border (D15).
shadcn's semantic tokens map onto them: `--primary` is ink, `--ring` is teal,
`--muted-foreground` is `--mute-text`. No dark mode in v1.

### Type

- **Cabinet Grotesk 700:** grid numerals, answer heading, headings.
- **Satoshi Variable:** UI and body text.
- **Body size:** 15/16 px, max line length 65ch.
- **Aligned numbers:** Satoshi with `font-variant-numeric: tabular-nums; font-kerning: none`.
- **Rupee lines:** an explicit line-height, since the ₹ glyph comes from a different font
  and changes the line box.
- **Loading:** the Cabinet preload uses `crossorigin`, so the file isn't fetched twice.
  Fallback fonts use measured metric overrides.

### shadcn hygiene

When components are copied in, strip:
- `transition-all`, `transition-colors`, `transition-[color,box-shadow]`
- accordion height keyframes
- `tw-animate-css`
- the Geist font
- the full `cn` engine

A CI test fails if any of these reappear.

---

## 8. Motion

### 8.1 How the rules are met in practice

- **What animates.** Only `opacity` and full `transform` strings (`"scale(0.96)"` →
  `"scale(1)"`), because those run on WAAPI. Motion's separate `x`/`y`/`scale` keys run on
  the main thread, so the sequence never uses them.
- **Motion setup.** `LazyMotion` (`strict`) + `domAnimation`, with `m` components only.
  Springs everywhere; Motion compiles them to CSS `linear()` easings.
- **The morph.** A FLIP (D10a): measure the result row and the card once, then run one WAAPI
  `transform` + `opacity` animation that we own.
- **`sequence.ts` controller.** Holds a generation token and every handle: WAAPI
  animations, rAF id, timers.
  - A new selection, Escape or a salary change bumps the token.
  - It cancels its own handles and sets final state at zero duration.
  - Motion `m` animations are driven by variant state, so they jump to the final variant
    when state changes.
- **Number ticker.** Writes `textContent` through a ref inside a rAF loop, with no React
  state per frame. Width is reserved from the final formatted string, and it's capped at
  200 ms.
- **`will-change: transform`.** Set on the card when the sequence starts, cleared on finish
  or cancel. Never in static CSS.
- **Response-to-action motion.**
  - buttons: `active:scale-[0.98]` via `transition-property: transform`
  - typeahead list: `opacity`/`transform` fade on open
  - disclosures: an instant height change plus a content `opacity`/`translateY` fade (never
    a height animation)
  - salary change: teal overlays crossfade and the ring moves by `transform`

### 8.2 The sequence (first in-app selection; D10c, D10e)

| Start (ms) | Element | Animation | Ends by (ms) |
|---|---|---|---|
| 0 | hero card | FLIP from result-row rect, spec spring | ~225 |
| 60 + 8·i | 28 cells, diagonal order | `opacity 0→1`, `scale(0.96)→scale(1)`, spec spring; last starts 276 | ~470 |
| 260 + 12·j | 10 window cells | wrapper `translateY(0)→translateY(-2px)`; teal overlay `opacity 0→1` | ~590 |
| 400 | answer cell | `scale(0.8)→scale(1)`, stiffness 1600 / damping 26 (D10b); marigold overlay and ring `opacity` | ~690 |
| 400 | — | `navigator.vibrate?.(8)`, only when a user gesture triggered the sequence | — |
| 500 | rupee figure | rAF ticker to its final value | 700 |

- A unit test computes every spring's settle time and asserts the sequence ends by 700 ms.
- A later selection while a card is visible skips the first two rows.

### 8.3 Reduced motion

When `useReducedMotion()` is true:
- the final state renders with `initial={false}`
- no FLIP, no ticker, no vibration
- response-to-action motion becomes instant too: button scale, list fade, disclosure fade,
  salary crossfade

`MotionConfig reducedMotion="user"` alone isn't enough, because it still animates opacity.

### 8.4 Verification harness (Phase 6)

- **Frame trace (`e2e/perf/reveal.trace.ts`).** Playwright Chromium records a CDP trace
  (`devtools.timeline`, `disabled-by-default-devtools.timeline.frame`) of the sequence. A
  parser reports per-frame main-thread cost and dropped frames for 0–700 ms.
  - The gate follows D11.
  - The trace `.json` is attached so you can open it in DevTools' Performance panel.
- **Layers.** The CDP `LayerTree` domain asserts the card is composited during the
  sequence.
- **Screenshots at 0/200/400/700 ms.**
  - WAAPI is paused through the CDP `Animation` domain (playback rate 0, then seek).
  - rAF-driven work is driven by Playwright's `page.clock`.
  - If this can't be made faithful, I'll use timed real captures and say so at the gate.
- **Reduced motion.** With `reducedMotion: 'reduce'`, assert `document.getAnimations()` is
  empty, no rAF ticks happen, and the final state is present at t=0.

---

## 9. Performance budgets

### Bundle

The honest picture from report 05:
- These are isolated probe builds summed, plus one full build of a trivial app (143 KB
  initial, 172.5 KB total). That trivial build still included shadcn's full `Command`
  wrapper, the `cn` engine, lucide icons and Geist CSS.
- The D18 choices remove most of those extras.

**Estimate: about 173 KB total with the FLIP morph, about 187 KB with `domMax`.**

| Chunk | Contents (gzipped KB) | Estimate |
|---|---|---|
| initial | react + react-dom 69.0, react-router 14.2, `m` + LazyMotion 15.1, app ~10 | ~108 |
| lazy: motion features | domAnimation 14.2 | 14 |
| lazy: search | cmdk + radix dialog 17.4, shadcn Command glue ~3, scorer | ~21 |
| lazy: disclosures | radix collapsible ~5, sections | ~7 |
| lazy: chart | uPlot 23.2 | ~23 |
| **total** | | **~173** |

How the limits get set:
- **Phase 1.** Build a skeleton that imports every planned component, measure it, and set
  the real limits from that.
- **Initial chunk.** Computed from `dist/.vite/manifest.json`: the entry plus every
  statically imported chunk.
- **Tooling.** `size-limit` with `gzip: true` (it defaults to Brotli).
- **Hard limits:**
  - total JS ≤ 180 KB
  - `index.json` ≤ 120 KB
  - each fund JSON ≤ 2 KB

### LCP < 1.2 s on "Fast 3G"

"Fast 3G" here means Lighthouse's default mobile profile: 150 ms RTT, 1.6 Mbps, 4× CPU. To
get there:
- **Prerendered HTML (§6.2).** The fund page paints fully without waiting for JS or data.
- **One font preload.** Only Cabinet Grotesk 700, with metric-matched fallbacks.
- **Small CSS.** About 6–8 KB gzipped.
- **No entrance animation on cold load.**

The Lighthouse CI gate is D13.

### Selection → rendered answer < 150 ms (criterion 1)

- **Warm-up.** Type "kotak mid", wait until results render and the top hit's JSON prefetch
  has finished.
- **Start:** Enter `keydown` (`event.timeStamp`).
- **End:** the answer heading's date text is committed *and* visible at computed opacity 1.
  Detected with `MutationObserver` + next rAF.
- **Pass:** median of 10 runs < 150 ms; the max is reported.
- **Also reported, not gated:** timing for type-then-Enter with nothing warm.
- Each lazy chunk has its own Suspense boundary, so nothing holds up the commit.

### CLS = 0

- **Reserved heights:** grid, answer block, ticker width.
- **Metric-matched fallbacks.** Single lines still run up to +1.14% wider, so text could
  wrap differently. If Lighthouse reports non-zero CLS, Satoshi switches to
  `font-display: optional`.

---

## 10. Hosting and CI

**Cloudflare Workers static assets (D20).** Build `pnpm build` = `fonts:fetch && vite build`,
plus the prerender step from Phase 4. Output goes to `dist/`, and `wrangler.jsonc` publishes
it with no server code. No env vars: Node comes from `.node-version`, pnpm follows
`packageManager`. Workers Builds deploys `main` and gives every branch a preview URL.

**`public/_headers`.** Honoured by Workers static assets. No `/*` rule, so nothing overlaps.

```
/data/:version/funds/*
  Cache-Control: public, max-age=31536000, immutable
/data/index.json
  Cache-Control: public, max-age=3600
/data/meta.json
  Cache-Control: public, max-age=300
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

Fund data is fetched from `/data/{dataVersion}/funds/{code}.json`, with `dataVersion` baked
into the HTML at build time; `index.json` and `meta.json` keep stable paths and revalidate.
There's no `_redirects` file: `not_found_handling: "single-page-application"` in
`wrangler.jsonc` provides the fallback.

### `.github/workflows/ci.yml` (PRs and pushes to `main`)

1. Install, using the fonts cache keyed by hash.
2. `pnpm typecheck`.
3. `pnpm test`: Vitest, including the rule tests.
4. `pnpm build --mode ci`. This always builds from `e2e/fixtures/data`, never from live
   nightly data, so unrelated PRs can't fail on data drift. It contains:
   - 119775 and 151713 frozen
   - synthetic marginal and meaningful funds, never deployed
   - a missing code
5. `size-limit`.
6. Playwright e2e against `wrangler dev`, the runtime production uses.
7. Lighthouse CI per D13.
8. On PRs, a smoke test against the Workers preview URL: routing, headers, and a missing
   fund file returning the shell rather than JSON.

### `.github/workflows/data.yml`

Cron `30 0 * * *` (D9), plus `workflow_dispatch` with a `full` input. `concurrency: data`.

1. Checkout, then restore `pipeline/.cache` and the fonts cache.
2. `pnpm pipeline`, then validate.
3. **Guard:** fail loudly if the fund count drops more than 10% from the committed
   `meta.json`, or leaves 800–1,600.
4. `pnpm typecheck && pnpm test && pnpm build` (spec §14 requires these before every
   commit).
5. If `public/data` changed, commit `chore(data): NAVs to <navAsOf>`. Then `git pull
   --rebase` and push, with up to 3 retries. The job needs `permissions: contents: write`.
6. **Deploy check:** poll the production `/data/meta.json` until its `dataVersion` matches.
   Fail after 30 minutes. This catches a failed Pages build, a Fontshare outage, or a
   `GITHUB_TOKEN` push that didn't trigger Pages.

Notes:
- `GITHUB_TOKEN` pushes don't trigger `ci.yml`, which is why steps 3–4 live here.
- Commit messages never contain `[skip ci]`, because Pages honours it.
- **Staleness:** the job fails if `navAsOf` is more than 7 calendar days old.

---

## 11. Compliance

- **Footer on every page.** Your text plus the D16 additions, with `navAsOf` visible.
- **No fund ranking.**
  - `index.json` is in code order.
  - Search is ordered by text relevance only.
  - No page, title or og tag compares funds.
  - og descriptions are neutral and contain no return figures.
- **Answer framing.** Copy states it's based on this fund's NAVs from `navFrom` to `navTo`,
  and that past patterns may not repeat.
- **Banned words.** A Vitest check scans `src/**` strings and prerender templates for:
  - "best fund", "top performing", "recommended fund"
  - the D7 list: "best", "recommend", "safe", "real advantage", "winner", "guaranteed",
    "outperform"

  It has an allow-list for code identifiers such as `safeWindow`.

---

## 12. Testing strategy

### Engine (Phase 2, tests written first)

- **`navOnOrAfter`:** +0, +7, +8 → null; never backward; gaps.
- **XIRR:**
  - the 5 Excel-produced fixtures plus 10 exact ones, to 4 dp
  - null reasons for the 5 no-root cases
  - sign-inverted series, exact-zero series
- **Simulation:**
  - constant NAV → XIRR 0
  - steady growth → the known rate
  - month-rule edges: first month, last partial month, 164/165 counts, common set = 164
- **Windows:** count, terminal rule, dropped windows, fractional tie credit (synthetic ties).
- **Stability:** average ranks, Pearson, zero variance → null.
- **Verdict and confidence:** the full truth table, including null stability.
- **Golden:**
  - Kotak full snapshot plus the criterion-3 assertions
  - 151713: 5 windows, "reduced"
  - Kotak cut to 36, 37 and 40 months

### Pipeline

- `--source fixture --as-of 2026-09-11` reproduces the 119775 artifact byte-for-byte.
- Eligibility against a recorded `/mf/latest` sample.
- Cache merge, including an overlap mismatch.
- Retry against a fake server.
- Validator, guard, and all-or-nothing writes.

### App units

- **`window.ts`:** every salary × buffer; a property test that the pick is always inside the
  window.
- **`answer.ts`:** tie-breaks, including a wrapped window.
- **`copy.ts`:** every D7 row, plus the banned-word check.
- **`format.ts`:** en-IN grouping, lakh, ordinals, "−", "<0.01 pp".
- **`search.ts`:**
  - "kotak mid" → 119775 first
  - "kotk mid" → 119775
  - no ordering by metrics
- **`sequence.ts`:** every step ends by 700 ms; interrupt leaves the final state.
- **`cn/lite`:** override behaviour.

### E2E (Playwright)

- Criterion 1 timing.
- Cold deep links with and without params: no hydration errors, CLS = 0, the same DOM as
  in-app navigation.
- Salary change moves the date.
- Not-covered, stale and offline states; missing JSON → 404.
- Keyboard-only flow.
- Reduced motion.
- Screenshots at 360, 390, 768 and 1280 px.

### Rule tests

Rule tests fail CI if any of these appear:
- a forbidden animation property or class in `src/**/*.{tsx,css}`
- a `motion.` import (only `m.`)
- a banned word
- `will-change` in static CSS

---

## 13. Acceptance criteria — how each is proven

| # | Criterion | Proof | Phase |
|---|---|---|---|
| 1 | `kotak mid` + Enter → date < 150 ms | §9 protocol: median of 10 < 150 ms, heading visible at opacity 1 | 5, 8 |
| 2 | XIRR matches Excel to 4 dp on 5 fixtures | The 5 Excel-produced fixtures (D17); your Excel run for the deep negative | 2 |
| 3 | Pipeline reproduces Kotak | `--source fixture --as-of 2026-09-11` pipeline run matches the frozen artifact (D2) | 2, 3 |
| 4 | Salary change changes the date | Unit (window 3–12 → 12th; `salary=15` → 25th) + e2e | 5 |
| 5 | 40-month fund → reduced confidence, no crash | 151713 golden + e2e deep link shows the reduced copy | 2, 5 |
| 6 | Deep links render on cold load | e2e on `wrangler dev` and the Workers preview, fresh context, with and without params | 4, 8 |
| 7 | No frame over 8.33 ms | D11: CDP trace gate + your 120 Hz device trace | 6 |
| 8 | Reduced motion bypasses the sequence | e2e: zero animations, final state at t=0 | 6 |
| 9 | Bundle-size and Lighthouse CI pass | CI run link (D13) | 8 |
| 10 | Cold pipeline < 20 min | `data.yml` dispatched with `full=true` and an empty cache; timing from the log | 8 |

---

## 14. Phases and gates

Before every commit: `pnpm typecheck && pnpm test && pnpm build`. Conventional commits.
I stop at each gate with the evidence listed.

### Phase 1 — Scaffold

- pnpm enabled locally (D18).
- Vite 6 + React 19 + strict TS, with tsconfigs for `src`, `pipeline` and `shared`.
- Tailwind v4 tokens.
- shadcn init (`vite`, `radix`), then strip motion classes, Geist and `tw-animate-css`;
  switch to `cn/lite`.
- Vitest, Playwright, size-limit (manifest-based initial set).
- `fonts:fetch` with pinned hashes. `.node-version`, exact `packageManager`,
  `onlyBuiltDependencies`.
- Rule tests; placeholder page with the compliance footer.
- **Bundle probe:** a throwaway route importing every planned component (cmdk, Collapsible,
  `m`, uPlot) to measure real sizes.
- CI skeleton.
- **Gate:**
  - clean typecheck, test and build
  - measured size table and proposed limits
  - CI green on a PR
  - **Cloudflare connected** (D19, D20): routing, headers and the data-miss behaviour
    verified against the branch's preview URL

### Phase 2 — Analysis engine (tests first)

- Fixtures moved into `pipeline/fixtures/`.
- §12 engine tests written first and failing.
- Then `nav.ts`, `xirr.ts`, `simulate.ts`, `rolling.ts`, `stability.ts`, `verdict.ts`,
  `analyse.ts`.
- Benchmark in ms per fund.
- **Gate:**
  - all fixtures green
  - the criterion-3 table printed beside the spec's values
  - short-history results

### Phase 3 — Pipeline

- `NavSource` (mfapi + fixture), eligibility with per-step counts, fetch pool, cache,
  workers, writer, validator, guard, `meta.json`, `--as-of`.
- Criterion-3 pipeline run; then `--limit 20`; then the full run.
- **Gate:**
  - the eligibility funnel and fund count
  - fund JSON max gzip size; `index.json` gzip size
  - cold and warm timings
  - the 119775 artifact diff
  - spot-checks of 3 funds

### Phase 4 — Routing, typeahead, URL state, minimal prerender

- Layout route, param parsing and clamping, data loader with cache and prefetch, scorer
  with fuzzy fallback, debounce with Enter flush, `/` shortcut, not-covered and error
  states.
- **Minimal prerender:** `entry-prerender`, per-fund HTML with inline JSON and og tags,
  hydrate vs `createRoot`, and the pending-params script.
- **Gate:** Playwright deep-link tests (with and without params, no hydration errors) pass
  on `wrangler dev` and the Workers preview.

### Phase 5 — Hero grid and safe window (static)

- `window.ts`, `answer.ts`, `copy.ts` with tests.
- Grid with overlays, copy table, rupee line, native salary and buffer selects.
- Landing state, footer with `navAsOf`, accessibility summary and focus.
- **Gate:**
  - screenshots at 4 widths for noise (Kotak), reduced (151713), and marginal and
    meaningful (synthetic fixtures), with my written critique
  - zoomed ₹ check
  - criteria 1, 4 and 5 green

### Phase 6 — Motion

- LazyMotion, FLIP morph, `sequence.ts`, the §8.2 schedule, ticker, vibration gating,
  interrupts, response-to-action motion, reduced motion, `will-change` handling.
- Perf harness.
- **Gate:**
  - traces and frame stats at 1× and 4×
  - layer check
  - screenshots at 0/200/400/700 ms with critique
  - criterion 8 green
  - **your 120 Hz device check** (D11)

### Phase 7 — Disclosures and chart

- Lazy disclosure chunk, uPlot curve with window highlight and span caption, confidence
  section, "What actually matters", `content-visibility`.
- **Gate:** screenshots expanded and collapsed, with critique; bundle report.

### Phase 8 — Performance pass, production, nightly data

- Full prerender polish, font preload and fallbacks, `_headers`, Lighthouse CI (D13).
- `data.yml` with guard, tests, rebase-push, deploy check and staleness check.
- Production deploy; first nightly run observed; curl checks against production for
  routing, headers and 404s.
- **Gate:** all 10 acceptance criteria with evidence links.

---

## 15. Risks, open questions, and things only you can do

### Needs you

- **Phase 1 — done:** Workers Builds is connected (D20) and Actions has write permission.
  Still outstanding: delete the stray `datadrivensip` Worker, which has no config and fails
  on every pull request.
- **Phase 6:** test the reveal on a real 120 Hz device (D11).
- **Before launch:** legal review of the AMFI terms and the copy (D16).
- **Optional:**
  - an Excel run of the −80% XIRR fixture (D17)
  - ITF consent to subset the fonts (D14)

### Open questions (defaults in brackets)

- Should "What actually matters" add a factual line for people who already run a SIP on
  another date in their window? For example: "In this fund, dates in your window have been
  interchangeable." [Not included, to stay clear of advice.]
- When a fund drops out of eligibility, prune its file or leave a tombstone? [Prune; deep
  links show "not covered".]
- Offer a setting to turn off the `/` keyboard shortcut (WCAG 2.1.4)? [No setting; it only
  fires when focus isn't in a form field.]

### Risks

| Risk | Mitigation |
|---|---|
| Kotak's stability (0.545) sits near 0.60, and upstream NAV corrections could flip its live verdict | Criterion 3 runs on the frozen snapshot; a live verdict change is legitimate and shown honestly |
| Bundle headroom is ~7–10 KB | Measured limits from Phase 1; FLIP instead of `domMax`; `cn/lite`; native selects; lazy chunks |
| LCP 1.2 s is stricter than Lighthouse's own "good" line (2.5 s) | Full prerender with inline JSON; one preloaded font |
| mfapi is a free, single-maintainer service with no SLA or terms | `NavSource` interface; AMFI `NAVAll.txt` adapter as fallback |
| Fontshare's pinned URLs could change or go down | Hash check, retries, Actions cache; the deploy check catches failed Pages builds |
| Scheduled runs can be delayed or dropped; public repos have schedules disabled after 60 days without activity (whether bot commits count is unverified) | `workflow_dispatch`, deploy check, staleness check; GitHub emails when it disables a workflow |
| Pages builds triggered by `GITHUB_TOKEN` pushes aren't documented | The deploy check fails loudly; any fallback needing a secret comes back to you as a decision |
| Production routing parity with local `wrangler` is unverified | Preview deployments from Phase 1 (D19) |
| Upstream renames or merges change fund names | Names shown verbatim; the not-covered state explains coverage |
