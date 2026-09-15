import { expect, test } from "@playwright/test";

// These run against `wrangler pages dev dist`, which uses Cloudflare Pages' routing and _headers
// handling (PLAN.md §10, D12). They only need HTTP, so they run once, not per device.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "HTTP-only checks run once");
});

test("a missing data file is a real 404, not the SPA shell with an immutable header", async ({ request }) => {
  const response = await request.get("/data/funds/000000.json");
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"] ?? "").not.toContain("immutable");
  expect(await response.text()).not.toContain('id="root"');
});

test("an app route falls back to index.html with a 200", async ({ request }) => {
  const response = await request.get("/f/119775?salary=28&buffer=2");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('id="root"');
});

test("fonts and hashed assets are cached immutably, index.html is not", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["cache-control"] ?? "").not.toContain("immutable");

  const script = /src="(\/assets\/[^"]+\.js)"/.exec(await home.text())?.[1];
  expect(script).toBeDefined();
  const asset = await request.get(script ?? "");
  expect(asset.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

  const font = await request.get("/fonts/v1/cabinet-grotesk-700.woff2");
  expect(font.status()).toBe(200);
  expect(font.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});
