/**
 * Build-time rendering only: there is no server at runtime (CLAUDE.md). `scripts/prerender.ts`
 * calls this to produce the markup inside each page's #root.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { FundArtifact } from "../shared/artifacts";
import { App } from "./app";
import { seedFund, setDataVersion } from "./lib/data";
import { setNavAsOf } from "./lib/head";

export function render(
  path: string,
  options: { dataVersion?: string; navAsOf?: string; fund?: FundArtifact } = {},
): string {
  setDataVersion(options.dataVersion ?? null);
  // Without this the footer would render a date in the browser and nothing here.
  setNavAsOf(options.navAsOf);
  if (options.fund) seedFund(options.fund);

  return renderToString(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
}
