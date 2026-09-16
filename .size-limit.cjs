// @ts-check
// Bundle budgets from PLAN.md §9. Sizes are gzip, because the spec's budget is gzip and
// @size-limit/file measures Brotli unless told otherwise.
const fs = require("node:fs");
const path = require("node:path");

/** @typedef {{ file: string, isEntry?: boolean, imports?: string[] }} ManifestChunk */

/**
 * The entry chunk plus every chunk it imports statically: what the browser loads up front.
 * @returns {string[]}
 */
function initialChunks() {
  const manifestPath = path.join(__dirname, "dist/.vite/manifest.json");
  /** @type {Record<string, ManifestChunk>} */
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
  if (!entry) throw new Error("No entry chunk in dist/.vite/manifest.json");

  /** @type {Set<string>} */
  const files = new Set();
  /** @param {ManifestChunk | undefined} chunk */
  const visit = (chunk) => {
    if (!chunk || files.has(chunk.file)) return;
    files.add(chunk.file);
    for (const key of chunk.imports ?? []) visit(manifest[key]);
  };
  visit(entry);
  return [...files].filter((file) => file.endsWith(".js")).map((file) => `dist/${file}`);
}

module.exports = [
  {
    name: "All JavaScript",
    path: "dist/assets/*.js",
    gzip: true,
    limit: "180 kB",
  },
  {
    name: "Initial JavaScript (entry and its static imports)",
    path: initialChunks(),
    gzip: true,
    limit: "115 kB",
  },
];
