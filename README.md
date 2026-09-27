# SIP Date Planner

What is the best day of the month to run your SIP for a given fund, and does the day
actually matter?

For most funds it barely does. Across 994 Indian mutual funds the spread between the
strongest and weakest date of the month is usually around a tenth of a percentage point
of XIRR — a few thousand rupees on a lakh-plus corpus built over a decade. The planner
answers with one concrete date anyway, because "pick a date and automate it" is more
useful than "it doesn't matter", and then it says plainly how little the choice was
worth. A verdict of `noise` is a correct answer here, not a failure to find one.

## How it works

Two halves that never mix.

**`/pipeline`** runs nightly on Node 22. It fetches published NAV histories, cleans them,
simulates a monthly SIP on every date from the 1st to the 28th, and solves each one's XIRR
by bisection. It also ranks each date against the other 27 across rolling three-year
windows — not to choose the day, but so the page can show whether the day it named earned its
rate or got it from one good run. The result is one precomputed JSON file per fund.

**`/src`** is a Vite and React SPA that fetches one of those files and renders it. It never
parses a NAV history and never solves an XIRR. Everything it shows was computed before the
page was served, so the answer appears in well under 150 ms and the whole app is static.

The day it names is the one with the greatest full-history XIRR, and the calendar shades every
other day by how it compares to the day you are reading on. Nothing about the answer is
configurable: a fund URL is just the fund.

Every fund also has its own page, listed in a [directory](/funds) linked from every footer and
in a sitemap the build writes, so the 1001 pages are reachable without running the search box.

The one thing you can change is how it looks. Light, dark or whatever your system asks for, in
one of four palettes, chosen in the header and kept in local storage — never in the URL, and
never an input to the answer. Every palette is static CSS selected by two attributes on `<html>`,
which an inline script sets before the first paint, so a dark page never starts out white.

## What it will not do

There is no ranking of funds, anywhere. Not in the UI, the copy, the index order, the URLs
or the metadata. The question is which date, for one fund you have already chosen; any
feature that would help you pick between funds is out of scope by design.

It is an educational tool, not investment advice, and it is not registered with SEBI or
affiliated with AMFI, mfapi.in or any fund house. Past performance does not indicate
future results.

## Running it

```
pnpm install
pnpm fonts:fetch     # licensed fonts, not redistributed in this repository
pnpm dev
```

`pnpm pipeline` rebuilds the fund data. `pnpm theme:css` regenerates the palette blocks in
`src/styles/index.css` from the table in `src/lib/theme.ts`.
`pnpm typecheck && pnpm test && pnpm build` is the gate every commit has to pass, and
`pnpm e2e` runs the Playwright suite against `wrangler dev`.

`PLAN.md` is the design and the source of truth for every decision in here. `CLAUDE.md`
holds the invariants that survive a change of author.
