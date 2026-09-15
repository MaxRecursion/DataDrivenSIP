> Incremental notes from a research agent that was cut off by a usage limit before its final summary. Findings marked VERIFIED were checked; treat the rest as leads.

# Hosting & CI research report (Phase 0) — incremental
Docs cached locally in this dir (fetched from developers.cloudflare.com .../index.md on 2026-09-15).

## 1a. Pages `_headers` (https://developers.cloudflare.com/pages/configuration/headers/ , last updated 2026-08-25)
- File `_headers` in build output (put in `public/` for Vite). Block = URL pattern line + indented `Name: value` lines.
- Multiple matching rules: request "will inherit all rules' headers". Same header applied twice -> values JOINED WITH COMMA (e.g. `X-Robots-Tag: nosnippet, noindex`). => NEVER set Cache-Control on both `/*` and `/data/funds/*` — you get `Cache-Control: a, b`. Use `! Cache-Control` detach in the narrower rule if a broad rule exists.
- Limits: max 100 header rules; 2,000 chars per line.
- Splat `*` greedy, single splat per URL; `:placeholder` matches except `/`.
- Redirects applied before headers; if a request matches both a redirect and header rule, redirect wins.
- `_headers` NOT applied to Pages Functions responses (irrelevant: no Functions).

## 1b. LOCAL EMPIRICAL ROUTING TESTS (wrangler 4.131.2 `pages dev`, same pages asset-server + _redirects/_headers parser as prod; prod parity UNVERIFIED — no CF account)
Scripts: routetest.sh / routetest2.sh ; outputs routetest.out / routetest2.out
- `_redirects` `/* /index.html 200` => REJECTED: "Found 1 invalid redirect rule: Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again." Same for `/f/* /index.html 200`. Also rejected by Workers static assets (`wrangler dev`). Corroborated in the wild: github.com/CristianNichifor/digital-public-administration-lab/pull/12 (prod Pages log shows same message).
- Behaviour with that rule == behaviour with NO _redirects (variants A and B byte-identical): no top-level 404.html => implicit SPA mode (docs serving-pages: "If your project does not include a top-level 404.html file, Pages assumes ... SPA").
- `/f/:code /index.html 200` (placeholder, NOT flagged) is HARMFUL: every /f/119775?salary=28 => 308 Location `/?salary=28` (rewrite target /index.html gets html-handling redirect to /) and overrides existing static f/119775.html (docs: "Redirects are always followed, regardless of whether or not an asset matches"). => Ship NO `_redirects` (or none targeting /index.html).
- Existing static assets always win over SPA fallback (assets, JSON, f/119775.html all served).
- Missing `/data/funds/999999.json` (SPA mode, fetch w/ Sec-Fetch-Mode: cors): **200, content-type text/html, body = index.html, AND the `/data/funds/*` Cache-Control `public, max-age=31536000, immutable` is applied** => a typo/unknown code poisons the browser cache for a year with HTML. Workers static assets (`not_found_handling: single-page-application`, no worker script) does the same for cors requests.
- FIX VERIFIED: add `public/data/404.html` (and/or `public/data/funds/404.html`) while keeping NO top-level 404.html: `/data/funds/999999.json` => **404, Cache-Control: no-store**, body FUNDS-404; `/data/nope.json` => 404 DATA-404; `/f/333333` still => 200 index.html (SPA mode kept). Pages walks up dirs for nearest 404.html; only falls back to index.html if none found up to root.
- With a top-level 404.html (variant D) SPA fallback disappears (/f/333333 => 404) — don't add one.
- 404 responses got `Cache-Control: no-store` even though `_headers` matched (custom x-dup headers still attached).
- Client detection (belt & braces): `if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) => not found`.
- Header merge VERIFIED: `/*` Cache-Control + `/data/funds/*` Cache-Control => `public, max-age=0, must-revalidate, public, max-age=31536000, immutable` (comma-joined, broken). `! Cache-Control` followed by `Cache-Control: ...` in the narrower block works.
- Defaults VERIFIED: 200s carry ETag; default `Cache-Control: public, max-age=0, must-revalidate`; `If-None-Match` => 304. Query strings ignored for asset lookup (`/data/funds/119775.json?v=2026-09-15` => same JSON).
- Trailing slash / pretty URLs VERIFIED: flat `f/119775.html` served at `/f/119775` (200); `/f/119775/` and `/f/119775.html` => 308 to `/f/119775` (query preserved: `/f/119775/?salary=28&buffer=2` => `/f/119775?salary=28&buffer=2`). Directory `f/222222/index.html` canonical is `/f/222222/` (`/f/222222` => 308 add slash). => generate FLAT `dist/f/{code}.html` to keep `/f/{code}?salary=..` canonical with zero redirects. Workers assets `auto-trailing-slash` same mapping but 307.
- `wrangler pages dev` prints `Ready on http://127.0.0.1:PORT` (usable as LHCI startServerReadyPattern).

## 1c. IMMUTABLE CACHING IS WRONG FOR UN-HASHED FUND JSON (design issue)
`/data/funds/119775.json` keeps the same URL but content changes nightly (navTo/corpus). `immutable, max-age=1y` => returning users see stale data up to a year. Options: (a) version the URL: `/data/funds/119775.json?v=<dataVersion>` where dataVersion is inlined into index.html at build (index.html is max-age=0 must-revalidate, so always fresh) — query ignored by Pages asset lookup (verified), but part of browser cache key; or path-version `/data/<buildId>/funds/...` (costlier: all 4k files re-uploaded anyway). (b) `Cache-Control: public, max-age=300, stale-while-revalidate=86400` + ETag revalidation (304). Recommend (a)+keep immutable, or (b) if simplicity wins.

## 1d. Limits (https://developers.cloudflare.com/pages/platform/limits/ , updated 2026-09-05)
- Free: 1 concurrent build, 500 builds/month; build timeout 20 min; 20,000 files/site (paid 100,000 with PAGES_WRANGLER_MAJOR_VERSION=4); 25 MiB per file; 100 header rules, 2,000 chars/header line; _redirects 2,000 static + 100 dynamic, 1,000 chars/rule; 100 projects/account.
- Build watch paths (.../pages/configuration/build-watch-paths/): push with 3000+ file changes or 20+ commits bypasses path matching and always builds.
- Skip build via commit message prefix `[CI Skip]`, `[Skip CI]`, `[CF-Pages-Skip]` etc. (github-integration doc).

## 1e. Build image (https://developers.cloudflare.com/pages/configuration/build-image/)
- v3 image defaults: Node 22.16.0 (override `NODE_VERSION` env or `.nvmrc`/`.node-version` file), npm 10.9.2, pnpm 10.11.1 (override only via `PNPM_VERSION` env var), Yarn 4.9.1, Bun 1.2.15.
- v3 NOT supported: pnpm version detection from pnpm-lock.yaml; Node/package-manager detection from package.json "engines". No mention of corepack/`packageManager`.
- v1 images auto-moved to v3 on 2026-09-15; v2 on 2027-02-23; v3 gets rolling preinstalled updates (pin to avoid drift).
- `SKIP_DEPENDENCY_INSTALL=1` env disables auto install. Build cache (opt-in) caches `.pnpm-store` for pnpm.
- "No env vars" spec => use `.node-version` file (22) ; pnpm: rely on preinstalled 10.x + packageManager field (see pnpm note below).

## 1f. Pages vs Workers steering (VERIFIED)
- Cloudflare blog 2025-04-08 https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/ : "you should start with Workers"; "Cloudflare Pages will continue to be supported, but, going forward, all of our investment, optimizations, and feature work will be dedicated to improving Workers."
- Pages docs (2026) keep a "Migrate to Workers" guide (updated 2026-08-14); `_headers`/`_redirects` supported natively on Workers static assets; SPA via `assets.not_found_handling: "single-page-application"`. Workers static assets Free: 20,000 files/version, 25 MiB/file (workers/platform/limits).
- Workers `wrangler dev` routing tested: same results as Pages for SPA fallback & flat f/{code}.html (307 instead of 308 for slash fixes); missing JSON => 200 index.html; `/* /index.html 200` also rejected as infinite loop.

## 4. Git growth simulation (gitgrowth/sim.mjs; 4,000 files avg 2,169 B raw, 16 MB on disk, tar.gz 1.99 MB; every file mutated nightly like real NAV-driven output)
- packed repo after init 2,849 KiB; after 10/20/30 nightly commits + `git gc`: 31,582 / 60,882 / 90,511 KiB => ~2.9 MiB per nightly commit => **~1.0 GiB/year** (tree objects for a 4,000-entry dir alone are ~150 KB raw/commit, SHA-1s incompressible).
- GitHub repo limits (docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits): recommended on-disk <10 GB; **directory width <=3,000 entries** (4,000 fund files in one dir exceeds it); single object 1 MB rec.; push 2 GB enforced; 6 pushes/min.
- Workers static assets + nested `data/funds/404.html` (SPA mode): missing JSON STILL 200 index.html (nested 404 ignored) — Pages-only trick. Point for staying on Pages.
- Pages clones shallow (community-reported: community.cloudflare.com/t/shallow-clone-of-git-repo/297243 ; UNVERIFIED in docs) so repo history growth mostly hurts dev clones/GitHub storage, not Pages builds; actions/checkout default fetch-depth 1.

## 2. Social previews
- Crawlers read raw HTML only. Evidence: Facebook docs (developers.facebook.com/docs/sharing/webmasters/web-crawlers/): OG properties "need to be listed before the first 1 MB"; Slack (api.slack.com/robots): Slackbot-LinkExpanding "fetches as little of the page as it can (using HTTP Range headers)", reads oEmbed / Twitter Card / Open Graph, caches ~30 min. LinkedInBot/Twitterbot/WhatsApp non-execution of JS: consistent secondary sources (linkedinpreview.com, opengraphplus.com, dev.to); no official first-party statement found => treat as fact for planning, label "officially UNVERIFIED". X docs page returned HTTP 402.
- => spec §6.6 "og: tags client-side" is ineffective for sharing. `<title>` client-side still fine for tabs/history.
- Static alternative (verified routing): post-build script reads dist/index.html, writes `dist/f/{code}.html` = same shell with per-fund `<title>`, `og:title`, `og:description`, `og:url` (canonical https://host/f/{code}), `og:image` (one shared absolute PNG), `twitter:card=summary_large_image`, `<link rel=canonical>`. Served at `/f/{code}` with 200, no redirect; query string untouched; SPA boots normally (same hashed assets). Unknown codes fall back to index.html (generic tags). Put og tags early in <head>.
- File count: ~4,000 JSON + ~4,000 HTML + ~50 assets + index/meta/404s ≈ 8,100 < 20,000 Free limit (headroom ~2.4x). HTML ~2-3 KB each => ~10 MB, generated at build (not committed).
- Vite preview (vite 6.4.3 source, htmlFallbackMiddleware): `/f/119775` -> rewrites to `/f/119775.html` if the file exists, `/x/` -> `/x/index.html`, else SPA `/index.html`. So `vite preview` mirrors Pages for flat per-fund HTML (but no _headers, no 308s, no nested 404).

## 3. GitHub Actions nightly job (docs cached: gh_events.md = docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows ; gh_trigger.md = .../how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- schedule (verbatim): "The `schedule` event can be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the start of every hour. If the load is sufficiently high enough, some queued jobs may be dropped." Runs only on default branch, latest commit; UTC by default (optional IANA `timezone` now supported); shortest interval 5 min. => "30 20 * * *" is off the top of the hour (good) but can still be delayed/dropped: make pipeline idempotent, add `workflow_dispatch`, and alert on staleness (e.g. CI/Playwright check that meta.navAsOf is < 3 days old, or a second cron that fails if data is stale).
- 60-day rule (verbatim, same page + disable-and-enable-workflows): "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." Private repos not mentioned. What counts: docs silent. Evidence commits made by workflows count: efrecon/gh-action-keepalive README keeps workflows alive by committing a marker file from a workflow (said API-toggle approach did not work). Caveat: gautamkrishnar/keepalive-workflow repo is now "disabled by GitHub Staff due to a terms of service violation" => don't add artificial keepalive commits; genuine nightly data commits are fine. Bot-commit counting officially UNVERIFIED. Mitigation: if no data change for weeks, workflow can fail loudly rather than fake commits.
- GITHUB_TOKEN (verbatim): "events triggered by the `GITHUB_TOKEN` will not create a new workflow run" (exceptions: workflow_dispatch/repository_dispatch; pull_request opened/synchronize/reopened now create approval-required runs). Implication: nightly data commit does NOT run ci.yml (no typecheck/tests/Lighthouse on data commits) — validate data inside data.yml itself (schema check, fund-count guard, build smoke) before pushing.
- Cloudflare Pages git integration is a GitHub App receiving push webhooks; the GITHUB_TOKEN rule applies to Actions workflow runs only, so a GITHUB_TOKEN push SHOULD trigger a Pages production build. No first-party doc states it explicitly => UNVERIFIED (verify on first nightly run). Avoid `[skip ci]`/`[CI Skip]` in bot commit messages — Pages honours those prefixes and would skip the deploy (GitHub Actions also honours [skip ci] for push/PR workflows).
- permissions: `permissions: contents: write` at job level (docs workflow-syntax `permissions`); org/repo default may be read-only; no other secrets needed.
- actions/cache (github.com/actions/cache README): 10 GB per repo; entries not accessed in 7 days evicted; key is immutable => use `key: pipeline-${{ runner.os }}-${{ github.run_id }}` + `restore-keys: pipeline-${{ runner.os }}-` ; default-branch caches are readable from other branches (schedule runs on default branch). Major versions v4 recommended in README; v5 requires runner >= 2.327.1. Treat cache as optimisation only (7-day eviction if a run is skipped/dropped for a week).

## 6. Bundle-size check (VERIFIED locally, size-limit 13.1.1 + @size-limit/file 13.1.1 on stack-probe/app/dist)
- @size-limit/file DEFAULT IS BROTLI (source: `check.gzip === true` -> gzip level 9; `brotli === false` -> raw; else brotli q11). Spec says "180 KB gzipped" => must set `"gzip": true`.
- gzip:true result 172,504 B == custom zlib gzip-9 sum 172,504 B (exact match). Brotli default 151,579 B. "180 kB" limit = 180,000 B (SI).
- Exit code 1 when a limit is exceeded; `--json` gives [{name,passed,size,sizeLimit}].
- Recommendation: size-limit + @size-limit/file (no bundler plugin; 2 small devDeps), two checks: total `dist/assets/*.js` gzip <= 180 kB, and initial entry chunk budget; add `index.json` gzip < 120 kB as a third check (path `dist/data/index.json`). Custom zlib script is equally accurate but you maintain globbing/reporting; size-limit gives PR-friendly output and `--why` is not needed.

## 5a. Throttling facts (VERIFIED from source)
- Chrome DevTools preset (devtools-frontend front_end/core/sdk/NetworkManager.ts): "Fast 3G" was RENAMED "Slow 4G" in May 2024 "to align with LH (crbug.com/342406608)". Values: download 1.6 Mbps x0.9 = 1.44 Mbps, upload 750 kbps x0.9 = 675 kbps, latency 150 x3.75 = 562.5 ms (targetLatency 150). "3G" (old Slow 3G): 400 kbps down/up (500x0.8), latency 2000 ms. New "Fast 4G": 8.1 Mbps down, 1.35 Mbps up, 165 ms.
- Lighthouse default mobile throttling `mobileSlow4G` (lighthouse throttling.md + LanternConstants): rttMs 150, throughputKbps 1638.4, CPU slowdown 4x; devtools-method equivalents requestLatencyMs 562.5, down 1474.56 kbps, up 675 kbps. Comment: "These values align with WebPageTest's definition of 'Fast 3G'". throttling.md: "in Lighthouse this configuration is currently called 'Slow 4G' but used to be labeled as 'Fast 3G'". => spec's "simulated Fast 3G" == Lighthouse default mobile run. Emulated device: moto g power 412x823 DPR 1.75.
- `mobileRegular3G`: rtt 300 ms, 700 kbps, CPU 4x.
- LCP scoring (lighthouse 12.6.1 core/audits/metrics/largest-contentful-paint.js): mobile p10 2500 ms, median 4000 ms (desktop 1200/2400). So 1.2 s mobile LCP scores ~100; the spec's 1.2 s target is the desktop p10, far stricter than needed for a 95 score.
- Lantern LCP = 0.5*optimistic + 0.5*pessimistic simulated graphs (intercept 0) (@paulirish/trace_engine lantern/metrics/LargestContentfulPaint.js).
- @lhci/cli latest 0.15.1 (published 2025-06-25) bundles lighthouse 12.6.1; lighthouse latest 13.4.1; LHCI docs show `npm install -g @lhci/cli@0.15.x && lhci autorun` in Actions.
