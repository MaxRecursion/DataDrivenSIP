/**
 * The checks that need the whole published corpus, and so need the filesystem.
 *
 * One duplicate title across 1001 pages is invisible in a diff, invisible in a screenshot and
 * invisible to every other test in this suite — and duplicate titles and descriptions across a
 * large set of near-identical pages are exactly what makes a site of 1001 pages get treated as a
 * site of one. This is the sweep that would catch it.
 *
 * It lives here rather than beside the module because `src` is compiled without Node's types.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FundArtifact, IndexRow, Meta } from "../../shared/artifacts";
import { pickAnswer } from "../../src/lib/answer";
import { buildDirectory, directoryCount } from "../../src/lib/directory";
import { fundDescription, fundTitle, sharedNames } from "../../src/lib/seo";

const root = join(import.meta.dirname, "../..");
const dataDir = join(root, "public/data");

const meta = JSON.parse(readFileSync(join(dataDir, "meta.json"), "utf8")) as Meta;
const index = JSON.parse(readFileSync(join(dataDir, "index.json"), "utf8")) as IndexRow[];
const fundsDir = join(dataDir, meta.dataVersion, "funds");

const funds: FundArtifact[] = readdirSync(fundsDir).map(
  (file) => JSON.parse(readFileSync(join(fundsDir, file), "utf8")) as FundArtifact,
);

/** What the prerender does: a page says its scheme code only when its name is not its own. */
const collisions = sharedNames(index);
const titleOf = (fund: FundArtifact) => fundTitle(fund, pickAnswer(fund), collisions.has(fund.name));
const descriptionOf = (fund: FundArtifact) =>
  fundDescription(fund, pickAnswer(fund), collisions.has(fund.name));

describe("every published fund page", () => {
  it("has a title of its own", () => {
    const titles = new Map<string, number[]>();
    for (const fund of funds) {
      const title = titleOf(fund);
      titles.set(title, [...(titles.get(title) ?? []), fund.code]);
    }
    const shared = [...titles.entries()].filter(([, codes]) => codes.length > 1);
    expect(shared, `funds sharing a title: ${JSON.stringify(shared.slice(0, 3))}`).toEqual([]);
  });

  it("has a description of its own", () => {
    const descriptions = new Set(funds.map(descriptionOf));
    expect(descriptions.size).toBe(funds.length);
  });

  it("disambiguates exactly the funds AMFI publishes under a shared name", () => {
    // Three names, six pages, as of this data. The count is not asserted — the pipeline runs
    // nightly and tomorrow's collisions are not today's — but the rule holds either way.
    for (const fund of funds) {
      const says = titleOf(fund).includes(`(scheme ${fund.code})`);
      expect(says, `${fund.code} ${fund.name}`).toBe(collisions.has(fund.name));
    }
  });

  it("leads its title with the fund's name, and never runs past what a result can show", () => {
    for (const fund of funds) {
      const title = titleOf(fund);
      expect(title.startsWith(fund.name), title).toBe(true);
      // Long Indian scheme names make a short title impossible; what must not happen is a title
      // so long that the answer itself is cut off. The fund name plus ": SIP on the 28th" is the
      // floor, and nothing may add to it beyond the optional site-name suffix.
      expect(title.length, title).toBeLessThanOrEqual(fund.name.length + 40);
    }
  });

  it("describes the fund in a length a search result will print", () => {
    for (const fund of funds) {
      const description = descriptionOf(fund);
      expect(description.length, `${fund.code}: ${description}`).toBeLessThan(400);
      expect(description.length, `${fund.code}`).toBeGreaterThan(80);
    }
  });
});

describe("the directory", () => {
  const groups = buildDirectory(index);

  it("lists every fund in the index exactly once", () => {
    expect(directoryCount(groups)).toBe(index.length);
    const codes = groups.flatMap((group) => group.funds.map((fund) => fund.code));
    expect(new Set(codes).size).toBe(index.length);
  });

  it("links every fund that has a prerendered page, and no fund that doesn't", () => {
    // A directory that links a page the build didn't write is a crawl of soft 404s.
    const linked = new Set(groups.flatMap((group) => group.funds.map((fund) => fund.code)));
    const published = new Set(funds.map((fund) => fund.code));
    expect([...linked].filter((code) => !published.has(code))).toEqual([]);
    expect([...published].filter((code) => !linked.has(code))).toEqual([]);
  });

  it("gives every category a distinct anchor", () => {
    const slugs = groups.map((group) => group.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
