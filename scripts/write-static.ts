/**
 * Static files that Vite doesn't produce, written into dist/ after `vite build`.
 */
import { mkdirSync, writeFileSync } from "node:fs";

// Cloudflare Pages serves the nearest 404.html walking up from a missing path. A nested one
// under /data makes a missing fund file a real 404 instead of index.html with status 200
// and the immutable cache header. It must not live at the top level, or Pages drops its SPA
// fallback for app routes like /f/119775 (PLAN.md D12). It's written here rather than in
// public/data because the pipeline replaces that directory.
const dataNotFound = `<!doctype html>
<html lang="en-IN">
  <meta charset="utf-8" />
  <title>Not found</title>
  <p>Not found.</p>
</html>
`;

mkdirSync("dist/data", { recursive: true });
writeFileSync("dist/data/404.html", dataNotFound);
