import { defineConfig, devices } from "@playwright/test";

const port = 4173;
// The Phase 4 gate asks for these same specs against a deployment as well as locally, so
// E2E_BASE_URL points them at one — and then no local server is started or needed.
const deployed = process.env.E2E_BASE_URL;
const baseURL = deployed ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  ...(deployed
    ? {}
    : {
        webServer: {
          // The same runtime and routing that production uses: Workers static assets from
          // wrangler.jsonc, including _headers and the SPA fallback (PLAN.md D20).
          command: `pnpm exec wrangler dev --port ${port} --ip 127.0.0.1`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          env: { WRANGLER_SEND_METRICS: "false" },
          timeout: 60_000,
        },
      }),
});
