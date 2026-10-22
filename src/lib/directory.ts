/**
 * Grouping the fund index into a browsable directory.
 *
 * This exists for one reason: before it, every one of the 1001 fund pages was an orphan. The only
 * route to one inside the app is a search box that needs JavaScript, so a crawler could reach the
 * home page and stop there. A sitemap fixes discovery; it does not fix the fact that a page
 * nothing links to carries almost no weight. This is the page that links to them.
 *
 * Ordering is alphabetical, inside categories that are themselves alphabetical. That is not a
 * detail — CLAUDE.md allows exactly one ranked list in this project, the trending five in the
 * search box, and this is not it. Nothing here is ordered by a metric, nothing here compares one
 * fund to another, and the rows carry no figures for a reader to read as a league table.
 *
 * Pure: no I/O, no clock, no randomness.
 */
import type { IndexRow } from "../../shared/artifacts";
import { sharedNames } from "./seo";

export type DirectoryGroup = {
  /** The category as the pipeline publishes it, e.g. "Equity Scheme - Value Fund". */
  category: string;
  /** A stable id for the in-page anchor, from the category alone. */
  slug: string;
  funds: ReadonlyArray<{
    code: number;
    name: string;
    house: string;
    /**
     * Set when another covered fund publishes under this same name, which AMFI does for a few
     * schemes. Two identical rows a reader can't tell apart is the same problem two identical
     * page titles are, and it has the same answer: say which scheme it is.
     */
    ambiguous: boolean;
  }>;
};

/**
 * "Equity Scheme - Value Fund" to "equity-scheme-value-fund". Only used for an in-page `#anchor`,
 * never for a URL a reader could land on, so it needs to be stable and unique among the
 * categories rather than pretty.
 */
export function categorySlug(category: string): string {
  return (
    category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

/**
 * The index, grouped by category and sorted by name within each.
 *
 * `localeCompare` with an explicit locale rather than the default: the default is the machine's,
 * and the prerender's machine is not the reader's. A directory whose order depended on which
 * agent built it would produce a different page from an identical input, which is exactly the
 * kind of churn that makes a diff unreviewable and a `lastmod` a lie.
 */
export function buildDirectory(rows: readonly IndexRow[]): DirectoryGroup[] {
  const byCategory = new Map<string, Array<{ code: number; name: string; house: string; ambiguous: boolean }>>();
  const shared = sharedNames(rows);

  for (const [code, name, house, category] of rows) {
    const key = category || "Uncategorised";
    const funds = byCategory.get(key) ?? [];
    funds.push({ code, name, house, ambiguous: shared.has(name) });
    byCategory.set(key, funds);
  }

  const compare = (a: string, b: string) => a.localeCompare(b, "en");

  return [...byCategory.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([category, funds]) => ({
      category,
      slug: categorySlug(category),
      funds: funds.sort((a, b) => compare(a.name, b.name) || a.code - b.code),
    }));
}

/** Every fund in the directory, in the order the page lists them. */
export function directoryCount(groups: readonly DirectoryGroup[]): number {
  return groups.reduce((total, group) => total + group.funds.length, 0);
}

/**
 * Every fund as the page lists it, in order, under the name the page prints — the scheme code
 * appended where AMFI shares the name. The structured data is built from this so that it
 * describes the page a reader sees, not the index file behind it.
 */
export function directoryListing(groups: readonly DirectoryGroup[]): Array<{ code: number; name: string }> {
  return groups.flatMap((group) =>
    group.funds.map((fund) => ({
      code: fund.code,
      name: fund.ambiguous ? `${fund.name} (scheme ${fund.code})` : fund.name,
    })),
  );
}
