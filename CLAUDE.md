# SIP Date Planner

A static web app that answers "what is the best day of the month to do a SIP for fund X?"
with one concrete date, and grades its own confidence honestly.

**The product changed on 2026-09-21.** The date is now simply the SIP day with the greatest
full-history XIRR, chosen from all 28. The salary window, the buffer, and selection by
rolling-window rank are gone — removed deliberately, not lost. `PLAN.md` predates that
change and carries an amendment at its head saying which of its sections no longer hold;
read both before starting any phase.

Two halves that never mix:

- `/pipeline` — Node 22 + TypeScript, runs nightly, does all analysis, writes
  `/public/data/`.
- `/src` — Vite 6 + React 19 SPA. It fetches one precomputed fund JSON and renders it.

## Non-negotiable

- No backend, no database, no runtime XIRR for the headline answer
- Bisection for XIRR, never Newton-Raphson
- SIP dates 1–28 only
- The answer is the highest full-history XIRR of the 28, ties going to the earliest date
- `verdict: "noise"` is a correct result — never tune thresholds to avoid it
- Animate transform and opacity only
- No fund ranking, ever

## What those mean in practice

- The runtime app never parses a NAV history. If a UI feature needs a number, the pipeline
  precomputes it into the fund JSON.
- Verdict thresholds are fixed: `spreadPp > 0.25` and `stability > 0.60`. Changing them, or
  the metrics feeding them, needs explicit user approval.
- Analysis code in `/pipeline/analysis/` is pure: no I/O, no `Date.now()`, no randomness.
  Write the test before the function. Kotak Mid Cap (119775) is the golden fixture and
  acceptance criterion 3 is the oracle: if the engine disagrees, the engine is wrong.
- Date math is UTC-only. Never construct a local-time `Date` in analysis code.
- Published NAV histories are cleaned before analysis (`PLAN.md` D21): single bad prints are
  dropped, and the series is cut at a re-denomination or a hole longer than 60 days. A fund
  whose history was cut carries `trimmedFrom` and is always reduced confidence, because the
  page must never present a truncated series as the fund's whole life.
- "Transform and opacity only" covers CSS too: no `transition-colors`, `transition-all`,
  shadow/height transitions or keyframes. Colour fills and rings are pre-painted overlays
  whose opacity animates. State changes that aren't animated are fine.
- Under `prefers-reduced-motion: reduce` the reveal sequence doesn't run at all.
- No ranking, sorting or comparing funds by returns anywhere: UI, copy, index order, URLs,
  metadata. Never write "best fund", "top performing" or "recommended fund". "Best" is fine of a
  DAY — it is the question the product asks — and `scripts/check-rules.ts` draws exactly that
  line. Typeahead results are ordered by text-match relevance only.
- The URL is `/f/{code}` and carries no state beyond which fund is shown. No Redux, Zustand,
  React Query, analytics SDKs or auth.
- The compliance footer and visible `navAsOf` appear on every page.
- **The grid and the answer are the same number now, and that is worth protecting.** Cells print
  each date's full-history XIRR and the named day is the greatest of them, so the picture and the
  sentence cannot disagree. They used to: the pick ran on `meanPct` — average rank across rolling
  3-year windows — while the cells showed XIRR, and on Parag Parikh Flexi Cap the page named the
  24th while the 28th showed the higher figure. That confused a reader badly enough to be worth
  recording. `meanPct`, `topQ` and `w` are still published and still discussed in "How confident
  is this?", but nothing may put them back into the selection without changing the headline too.
- The shading is a comparison to today, not a ranking of the month. Today's date in Asia/Kolkata,
  clamped to the 28th, is the baseline and paints neutral; dates above it are green and below it
  red. Each direction scales to its own extreme, so the deepest red is the month's worst date
  even when the reds span a hundredth of a point and the greens span a third of one.
- There is no salary window, no buffer and no `?salary=`/`?buffer=`. Old links still resolve —
  the query string is ignored rather than redirected — and nothing in the URL changes the answer.
- **The calendar is clock-dependent, so it renders after mount, never in the prerendered
  HTML**, with its height reserved so nothing shifts. Dates 29–31 appear inert and carry no
  data: SIP dates are 1–28, which is the whole reason the engine stops there.
- Rounding is a claim. `formatPp`'s floor exists so a real difference is never printed as
  "0.00", and a ticker must not sit on a zero inside a sentence — "ended ₹0 apart" was on
  screen for half a second before anyone noticed.
- **The prerendered stylesheet is inlined, never linked.** `scripts/prerender.ts` reads the
  built CSS and writes it into every page's `<head>` as a `<style>` tag. A linked stylesheet
  measured as 99% of LCP under real throttling — a render-blocking file, however small, costs a
  full round trip before anything paints. Don't reintroduce `<link rel="stylesheet">` for the
  main bundle without re-measuring (PLAN.md D13).
- **Cabinet Grotesk and Satoshi are `font-display: optional`, not `swap`.** Confirmed both still
  report `status: "loaded"` after a normal cold navigation, so the branded fonts still render in
  practice; `optional` only degrades toward the fallback on a connection too slow for the pixel
  timing to matter anyway. This is what gets CLS to exactly 0 — `swap` left a measurable, if
  tiny, shift from the metric-matched fallback not being a pixel-perfect match (PLAN.md D13).
- Lighthouse CI runs with `throttlingMethod: "devtools"`, not the default `simulate`. Lantern's
  simulation attributed most of this page's LCP to script-parsing time it estimated from bundle
  size, without knowing the content is prerendered and paints before the deferred module script
  runs at all — a real trace (`total-blocking-time: 0`) contradicts it directly. Don't switch
  back to `simulate` without re-measuring against a real trace first (PLAN.md D13).

## Facts verified in Phase 0 research

Evidence is in `docs/research/phase-0/`. These are observed facts, not design choices.
The design choices built on them are the D-items in `PLAN.md` §0. The user approved all of
them on 2026-09-15, so `PLAN.md` is the source of truth.

- Engine conventions in `PLAN.md` §4 reproduce criterion 3 on NAV data frozen at
  2026-09-11 (`docs/research/phase-0/fixtures/119775.nav.json`). Kotak's stability is
  0.545 under the pinned split rule but ranges ~0.51–0.67 across other month-set and split
  choices. Changing either can flip its verdict.
- XIRR bisection must check that NPV has opposite signs at −0.99 and 3.0. Without that
  check, the loop silently returns a bracket end instead of null.
- Motion 12 (observations from Phase 0; the library was removed in Phase 6, and these are kept
  only in case it is ever reconsidered):
  - `layoutId` needs `domMax`; under `domAnimation` it does nothing.
  - Separate `x`/`y`/`scale` keys run on the main thread; `opacity` and full `transform`
    strings go to WAAPI.
  - Motion doesn't manage `will-change`.
  - `reducedMotion="user"` still animates opacity.
- Hosting is Cloudflare **Workers static assets**, not Pages (PLAN.md D20). Verified on the
  live Worker and with `wrangler dev`: `_headers` is honoured, `/f/{code}` falls back to the
  shell, and a missing `/data/**.json` returns index.html with a 200 and whatever cache
  header matched. That is why data URLs carry the data version and the client checks the
  content type before parsing.
- Pages facts below stay true if the project ever moves back (verified with
  `wrangler pages dev`):
  - `/* /index.html 200` in `_redirects` is rejected as an infinite loop.
  - SPA fallback works as long as there's no top-level `404.html`.
  - A missing JSON file returns `index.html` with 200 unless a nested `data/404.html`
    exists. The build must write that file into `dist/`, because the pipeline replaces
    `public/data`.
  - Overlapping `_headers` rules comma-join their `Cache-Control` values.
- Fontshare's licence (ITF FFL 2.0):
  - forbids subsetting or converting the fonts without ITF's written consent
  - forbids redistributing them through a public repository, and this repo is public
  - Cabinet Grotesk has no tabular figures; Satoshi has no ₹ glyph
- mfapi returns HTTP 200 with empty data for unknown scheme codes.

## Stack is fixed

Vite 6, React 19 + strict TS, shadcn/ui (Radix), Tailwind CSS v4 (`@theme`), uPlot (never
shadcn charts or Recharts), React Router v7 declarative mode, Vitest, Playwright, pnpm.
Don't add dependencies outside this list without asking.

**No animation library.** The reveal is hand-written on WAAPI in `src/components/animated.tsx`,
with springs solved in `src/lib/spring.ts` and compiled to CSS `linear()` easings, and the
schedule and its controller in `src/lib/sequence.ts`. `motion` was removed in Phase 6: measured
at 67 KB gzipped it put total JS at 203 KB against §9's hard 180 KB limit, because `LazyMotion`
pulls the animation engine in whichever entry `m` is imported from, so lazy features don't help.
This follows D10a, which had already rejected `domMax` on the same grounds. The rule is
unchanged and still enforced — animate opacity and full `transform` strings only — only the tool
is different. Don't reintroduce an animation library without re-measuring the total.

## Workflow

- Work in the phase order from `PLAN.md` and stop for user review at every gate.
- Before every commit: `pnpm typecheck && pnpm test && pnpm build`.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `docs:`, `perf:`).
- Phases 5–7: take Playwright screenshots, look at them, critique before calling the gate.
- Screenshots run against `wrangler dev`, which serves `dist/`. Run `pnpm build` first or you
  will critique the previous build and conclude your change did nothing.
- `pnpm build:ci` builds from `e2e/fixtures/data` instead of the real `public/data` (PLAN.md
  §10). It exists and is proven in its own CI job, but the main CI gate still builds from real
  data — don't assume `pnpm test`'s "real published funds" assertions in `copy.test.ts` and
  `disclosure.test.ts` are drift-proof; they read `public/data` directly.

## Copy rules

Sentence case. No ALL-CAPS eyebrows, no single-word colour accents in headlines, no `→` in
buttons, no middle-dot meta strings, body lines under 80 characters. Fonts are Cabinet
Grotesk (numerals, headline) and Satoshi (UI) — never Inter or Geist.
