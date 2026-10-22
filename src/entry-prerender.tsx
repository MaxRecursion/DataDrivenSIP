/**
 * Build-time rendering only: there is no server at runtime (CLAUDE.md). `scripts/prerender.ts`
 * calls this to produce the markup inside each page's #root.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { FundArtifact, IndexRow } from "../shared/artifacts";
import { App } from "./app";
import { seedFund, seedIndex, setDataVersion } from "./lib/data";
import { setNavAsOf } from "./lib/head";

export function render(
  path: string,
  options: { dataVersion?: string; navAsOf?: string; fund?: FundArtifact; index?: IndexRow[] } = {},
): string {
  setDataVersion(options.dataVersion ?? null);
  // Without this the footer would render a date in the browser and nothing here.
  setNavAsOf(options.navAsOf);
  if (options.fund) seedFund(options.fund);
  // The directory renders its thousand links from this; every other page ignores it.
  if (options.index) seedIndex(options.index);

  return renderToString(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
}
