import { expect, test } from "@playwright/test";

// These run against `wrangler dev`, which serves the site exactly as Cloudflare Workers
// static assets does in production, including _headers (PLAN.md D20). They only need HTTP,
// so they run once rather than per device.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "HTTP-only checks run once");
});

test("an app route falls back to the shell with a 200", async ({ request }) => {
  const response = await request.get("/f/119775?salary=28&buffer=2");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('id="root"');
});

test("a missing data file returns the shell, so the client must check the content type", async ({ request }) => {
  // Workers static assets has no per-directory 404: an unknown fund code gets index.html
  // with a 200. That is why the client treats a non-JSON content type as "not covered", and
  // why fund data is fetched from a path carrying the data version, so a cached miss is
  // retired by the next build rather than living for a year.
  const response = await request.get("/data/funds/000000.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
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
  expect(font.headers()["content-type"]).toContain("font/woff2");
  expect(font.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});
