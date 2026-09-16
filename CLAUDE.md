# SIP Date Planner

A static web app that answers "which date of the month should I run my SIP for fund X?"
with one concrete date, and grades its own confidence honestly. `PLAN.md` holds the
design and phase plan; read it before starting any phase.

Two halves that never mix:

- `/pipeline` — Node 22 + TypeScript, runs nightly, does all analysis, writes
  `/public/data/`.
- `/src` — Vite 6 + React 19 SPA. It fetches one precomputed fund JSON and renders it.

## Non-negotiable

- No backend, no database, no runtime XIRR for the headline answer
- Bisection for XIRR, never Newton-Raphson
- SIP dates 1–28 only
- Never select a date outside the safe window
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
- "Transform and opacity only" covers CSS too: no `transition-colors`, `transition-all`,
  shadow/height transitions or keyframes. Colour fills and rings are pre-painted overlays
  whose opacity animates. State changes that aren't animated are fine.
- Under `prefers-reduced-motion: reduce` the reveal sequence doesn't run at all.
- No ranking, sorting or comparing funds by returns anywhere: UI, copy, index order, URLs,
  metadata. Never write "best fund", "top performing" or "recommended fund". Typeahead
  results are ordered by text-match relevance only.
- State lives in the URL (`/f/{code}?salary=&buffer=`). No Redux, Zustand, React Query,
  analytics SDKs or auth.
- The compliance footer and visible `navAsOf` appear on every page.

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
- Motion 12:
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

Vite 6, React 19 + strict TS, shadcn/ui (Radix), Tailwind CSS v4 (`@theme`), `motion` v12
via `LazyMotion` + `m`, uPlot (never shadcn charts or Recharts), React Router v7 declarative
mode, Vitest, Playwright, pnpm. Don't add dependencies outside this list without asking.

## Workflow

- Work in the phase order from `PLAN.md` and stop for user review at every gate.
- Before every commit: `pnpm typecheck && pnpm test && pnpm build`.
- Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `docs:`, `perf:`).
- Phases 5–7: take Playwright screenshots, look at them, critique before calling the gate.

## Copy rules

Sentence case. No ALL-CAPS eyebrows, no single-word colour accents in headlines, no `→` in
buttons, no middle-dot meta strings, body lines under 80 characters. Fonts are Cabinet
Grotesk (numerals, headline) and Satoshi (UI) — never Inter or Geist.
