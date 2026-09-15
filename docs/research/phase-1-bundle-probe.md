# Phase 1 bundle probe

Measured 2026-09-15 for the Phase 1 gate (PLAN.md §9).

A throwaway app (`.probe/`, gitignored) imported every planned runtime library. It was
built with the project's Vite 6.4.3 setup, and sizes are gzip level 9.

Libraries:
- **Initial load:**
  - react and react-dom 19.3.0
  - react-router 7.18.3 in declarative mode: `BrowserRouter`, `Routes`, `Route`,
    `useParams`, `useSearchParams`, `useNavigate`, `Link`
  - motion 12.43.0, as `m` + `LazyMotion strict` with `domAnimation` loaded async
  - `cn/lite`
- **Lazy-loaded:**
  - cmdk 1.1.1
  - Radix `Collapsible` via `radix-ui` 1.6.7
  - uPlot 1.6.32 bars

| Chunk | Contents | gzip kB |
|---|---|---|
| initial | react, react-dom, react-router, `m` + LazyMotion, cn/lite, probe shell | 98.3 |
| lazy | uPlot and chart component | 23.4 (+0.7 CSS) |
| lazy | motion `domAnimation` features | 14.0 |
| lazy | cmdk | 13.6 |
| lazy, shared | Radix primitives shared by search and disclosures (cmdk pulls in `@radix-ui/react-dialog`) | 4.1 |
| lazy | Radix Collapsible | 1.1 |
| **total JS** | | **154.4** |

## What it means

- **Libraries alone take 154.4 kB.** That leaves **~25 kB** for app code before the 180 kB
  total limit.
- **The initial set is 98.3 kB.** That leaves **~16 kB** of app code in the entry chunk
  before the 115 kB initial limit.
- **The plan's estimate was ~173 kB total.** It assumed ~10 kB of app code and shadcn
  Command glue on top of cmdk. The measurement is consistent with that.
- **The initial chunk equals the sum of the isolated probes** from research report 05:
  69.0 + 14.2 + 15.1 = 98.3.
- **Limits stay as planned:** 180 kB total (the spec) and 115 kB initial. CI enforces both
  through `pnpm size`.
- **Levers if app code runs over:**
  - move React Router's `Link` usage behind plain anchors
  - keep search logic in the lazy search chunk
  - keep formatting helpers out of the entry
