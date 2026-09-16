/**
 * Writes a static page per fund, plus the home page (PLAN.md D12, §6.2).
 *
 * Link-preview crawlers don't run JavaScript, so og tags have to be in the HTML. The same
 * pass inlines the fund's own data and the data version, which is what lets a deep link paint
 * without a request. This is build-time generation: no server runs at request time.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FundArtifact, Meta } from "../shared/artifacts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const dataDir = join(dist, "data");

type Renderer = (
  path: string,
  options: { dataVersion?: string; navAsOf?: string; fund?: FundArtifact },
) => string;

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** `</script>` inside JSON would end the tag early. */
const escapeJson = (value: string) => value.replace(/</g, "\\u003c");

function page(
  template: string,
  parts: {
    path: string;
    markup: string;
    title: string;
    description: string;
    canonical: string;
    meta: Meta;
    fund?: FundArtifact;
  },
): string {
  const head = [
    `<meta name="data-version" content="${escapeAttribute(parts.meta.dataVersion)}" />`,
    `<meta name="nav-as-of" content="${escapeAttribute(parts.meta.navAsOf)}" />`,
    `<meta name="description" content="${escapeAttribute(parts.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeAttribute(parts.title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(parts.description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(parts.canonical)}" />`,
    `<link rel="canonical" href="${escapeAttribute(parts.canonical)}" />`,
  ].join("\n    ");

  const inline = parts.fund
    ? `\n    <script type="application/json" id="fund-data">${escapeJson(JSON.stringify(parts.fund))}</script>`
    : "";

  let html = template;
  // The path, not just a flag: Workers answers an unknown path with this same file, and only
  // the page built for the path being loaded can be hydrated onto.
  html = replaceOnce(
    html,
    '<html lang="en-IN">',
    `<html lang="en-IN" data-prerendered="${escapeAttribute(parts.path)}">`,
    "mark the page prerendered",
  );
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeAttribute(parts.title)}</title>`, "set the title");
  html = replaceOnce(html, /<meta\s+name="description"[^>]*>/, "", "drop the template description");
  html = replaceOnce(html, "</head>", `  ${head}${inline}\n  </head>`, "add the head tags");
  html = replaceOnce(html, '<div id="root"></div>', `<div id="root">${parts.markup}</div>`, "inline the markup");
  return html;
}

/**
 * A replacement that quietly matched nothing would ship a page with no markup and no data
 * version — it would still look like a successful build, so insist instead. The replacement
 * is passed as a function because `$&` and friends inside a fund name or the inlined JSON
 * would otherwise be read as patterns.
 */
function replaceOnce(html: string, find: string | RegExp, insert: string, what: string): string {
  // Test for the match rather than compare the result: the home page's title is already the
  // one being written, and an unchanged string there is correct rather than a failure.
  const found = typeof find === "string" ? html.includes(find) : find.test(html);
  if (!found) throw new Error(`prerender: could not ${what} — index.html changed shape`);
  return html.replace(find, () => insert);
}

async function main(): Promise<void> {
  const template = await readFile(join(dist, "index.html"), "utf8");
  const meta = JSON.parse(await readFile(join(dataDir, "meta.json"), "utf8")) as Meta;
  const { render } = (await import(pathToFileURL(join(root, ".prerender/entry-prerender.js")).href)) as {
    render: Renderer;
  };

  // The canonical origin only matters for og:url; a preview deployment still renders.
  const origin = process.env.SITE_ORIGIN ?? "https://sip-date-planner.kulkarniakshay1989.workers.dev";

  await writeFile(
    join(dist, "index.html"),
    page(template, {
      path: "/",
      markup: render("/", { dataVersion: meta.dataVersion, navAsOf: meta.navAsOf }),
      title: "SIP Date Planner",
      description: "Pick a SIP date for your mutual fund, with an honest read on how much the date matters.",
      canonical: `${origin}/`,
      meta,
    }),
  );

  const fundsDir = join(dataDir, meta.dataVersion, "funds");
  const files = await readdir(fundsDir);
  await mkdir(join(dist, "f"), { recursive: true });

  let written = 0;
  for (const file of files) {
    const fund = JSON.parse(await readFile(join(fundsDir, file), "utf8")) as FundArtifact;
    const html = page(template, {
      path: `/f/${fund.code}`,
      markup: render(`/f/${fund.code}`, { dataVersion: meta.dataVersion, navAsOf: meta.navAsOf, fund }),
      title: `${fund.name} — SIP Date Planner`,
      description: `Which date of the month to run a SIP in ${fund.name}, and how much the date has actually mattered.`,
      canonical: `${origin}/f/${fund.code}`,
      meta,
      fund,
    });
    // Flat files: Workers serves f/119775.html at /f/119775 with no redirect.
    await writeFile(join(dist, "f", `${fund.code}.html`), html);
    written++;
  }

  console.log(`prerendered ${written} fund pages and the home page for ${meta.dataVersion}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
