import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

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
  webServer: {
    // Cloudflare Pages' own routing and _headers handling, not Vite's preview server (PLAN.md §10).
    command: `pnpm exec wrangler pages dev dist --ip 127.0.0.1 --port ${port} --compatibility-date=2026-09-15`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { WRANGLER_SEND_METRICS: "false" },
    timeout: 60_000,
  },
});
