import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    target: "es2022",
    // The size check reads the manifest to find the entry chunk and its static imports.
    manifest: true,
  },
  // `--mode ci` builds from a frozen fund set (scripts/ci-public-dir.ts assembles it into
  // .ci-public/) rather than from the real, nightly-updated public/data, so an unrelated PR
  // can't fail because last night's pipeline run changed a number (PLAN.md §10).
  publicDir: mode === "ci" ? ".ci-public" : "public",
}));
