import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "@/app";
import { seedFund, setDataVersion } from "@/lib/data";
import type { FundArtifact } from "../shared/artifacts";
import "@/styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// The build stamps the data version into the page and inlines the fund's own data, so a deep
// link paints without waiting for a request (PLAN.md §6.2).
setDataVersion(document.querySelector('meta[name="data-version"]')?.getAttribute("content") ?? null);

const inline = document.getElementById("fund-data")?.textContent;
if (inline) {
  try {
    seedFund(JSON.parse(inline) as FundArtifact);
  } catch {
    // A corrupt inline payload just means one extra request.
  }
}

const tree = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

/**
 * Hydration needs markup built for exactly this view. Two ways it wouldn't be: Workers serves
 * the home page's HTML for any path it has no file for, and parameters change what the app
 * renders. In either case, render fresh rather than hydrate onto markup that doesn't match.
 */
const builtFor = document.documentElement.dataset.prerendered;
const sameView = builtFor === window.location.pathname && window.location.search === "";

if (sameView) hydrateRoot(root, tree);
else createRoot(root).render(tree);
