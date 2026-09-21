/**
 * D13's numbers, run against the same `wrangler dev` runtime the e2e suite uses (PLAN.md D20):
 * routing, `_headers` and the SPA fallback all behave as production does, which a plain static
 * file server wouldn't prove.
 *
 * `.cjs` because the project is `"type": "module"` and the LHCI config loader expects CommonJS.
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm exec wrangler dev --port 4173 --ip 127.0.0.1",
      startServerReadyPattern: "Ready on",
      startServerReadyTimeout: 30_000,
      url: ["http://127.0.0.1:4173/", "http://127.0.0.1:4173/f/119775"],
      // Runner noise on LCP and CLS is exactly what a median of 3 exists to damp out.
      numberOfRuns: 3,
      /*
       * `devtools`, not Lighthouse's own default (`simulate`/Lantern) — a deliberate, measured
       * departure worth reading before changing back.
       *
       * Lantern estimates LCP from a request-dependency graph plus a CPU-cost heuristic for
       * script bytes, and for this page it put "Render Delay" at 1353-1505 ms — about 75-99% of
       * a simulated LCP of 1806-1960 ms — attributed to parsing and executing the ~100 KB
       * initial bundle under 4x CPU slowdown. That heuristic doesn't know the content is
       * prerendered: real Chrome paints the server-rendered HTML and CSS without waiting for a
       * deferred `type="module"` script at all. A real trace under identical throttling
       * (`--throttling-method=devtools`) confirms it: `total-blocking-time` is 0 ms and LCP is
       * 772-791 ms, comfortably inside budget. `mainthread-work-breakdown` sums to ~230 ms
       * across the whole run — nowhere near Lantern's estimate.
       *
       * `devtools` runs the real throttled trace instead of estimating one, so it doesn't carry
       * this bias. The trade is more inherent run-to-run variance than a closed-form estimate,
       * which `numberOfRuns: 3` exists to absorb — real margin here is about 35%.
       *
       * No `preset` either way: Lighthouse's default settings already run the mobile form
       * factor with its default throttling profile, which Phase 0 research
       * (06-hosting-and-ci.md) confirmed is exactly what spec §9 calls "Fast 3G" — 150 ms RTT,
       * 1.6 Mbps, 4x CPU slowdown. The `preset` flag only offers "perf" (strips non-perf
       * categories), "experimental" and "desktop", none of which is this.
       */
      settings: {
        throttlingMethod: "devtools",
        /*
         * `--no-sandbox` and `--disable-dev-shm-usage`: Chrome's own sandbox refuses to start
         * at all under the root user a GitHub Actions runner uses, crashing with "No usable
         * sandbox!" before Lighthouse can connect to it — confirmed by the first real CI run.
         * Playwright's own test runner handles this itself; chrome-launcher (what lhci drives)
         * does not, so it needs the flags explicitly. Safe here specifically because this
         * browser only ever loads a URL this same job just built and served locally.
         */
        chromeFlags: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: ".*",
          assertions: {
            "categories:performance": ["error", { minScore: 0.9 }],
            "largest-contentful-paint": ["error", { maxNumericValue: 1200 }],
            "cumulative-layout-shift": ["error", { maxNumericValue: 0 }],
          },
        },
      ],
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
