# SIP Date Planner

Which date of the month should you run your SIP for a given fund, and does the date
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
by bisection. It then ranks each date against the other 27 across rolling three-year
windows, because a single all-history rate is the number those percentiles exist to
distrust. The result is one precomputed JSON file per fund.

**`/src`** is a Vite and React SPA that fetches one of those files and renders it. It never
parses a NAV history and never solves an XIRR. Everything it shows was computed before the
page was served, so the answer appears in well under 150 ms and the whole app is static.

The date it names is always one your salary has already arrived for. That window is set by
your pay day and a buffer you control, both of which live in the URL.

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

`pnpm pipeline` rebuilds the fund data. `pnpm typecheck && pnpm test && pnpm build` is the
gate every commit has to pass, and `pnpm e2e` runs the Playwright suite against
`wrangler dev`.

`PLAN.md` is the design and the source of truth for every decision in here. `CLAUDE.md`
holds the invariants that survive a change of author.
