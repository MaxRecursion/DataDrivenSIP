import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: [
      "src/**/*.test.{ts,tsx}",
      "pipeline/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    environment: "node",
  },
});
