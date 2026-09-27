/**
 * The head, kept in step with the page after hydration and on every client-side navigation
 * (spec §6.6).
 *
 * Link-preview crawlers read the prerendered HTML and never run this. Google does run it: it
 * renders the page and indexes the head as it stands afterwards. So whatever this writes is what
 * Google indexes — it has to be the same title and description the prerender wrote, from the same
 * functions in `seo.ts`, or hydration quietly replaces a page's own title with something else.
 * It did exactly that until 2026-09-27, putting one shared sentence back on all 1001 fund pages.
 */

function setMeta(keyName: "name" | "property", key: string, value: string): void {
  let tag = document.head.querySelector(`meta[${keyName}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(keyName, key);
    document.head.append(tag);
  }
  tag.setAttribute("content", value);
}

/**
 * The origin the prerender stamped into the canonical link, which is production's even on a
 * preview deployment. Reading `window.location.origin` instead would point a preview's canonical
 * at the preview, disagreeing with the HTML it was served.
 */
function canonicalOrigin(): string {
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (link?.href) {
    try {
      return new URL(link.href).origin;
    } catch {
      // A malformed href falls through to the page's own origin.
    }
  }
  return window.location.origin;
}

export function setHead(head: { title: string; description: string; path: string }): void {
  if (typeof document === "undefined") return;
  const url = `${canonicalOrigin()}${head.path}`;

  document.title = head.title;
  setMeta("name", "description", head.description);
  setMeta("property", "og:title", head.title);
  setMeta("property", "og:description", head.description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", head.title);
  setMeta("name", "twitter:description", head.description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = url;
}

let navAsOf: string | undefined;

/** The prerender has no document, so it hands the date over instead (see entry-prerender). */
export function setNavAsOf(value: string | undefined): void {
  navAsOf = value;
}

/**
 * Stamped into the page by the prerender step, so the footer needs no extra request — and so
 * the build and the browser read the same date, which hydration depends on.
 */
export function navAsOfFromDocument(): string | undefined {
  if (navAsOf) return navAsOf;
  if (typeof document === "undefined") return undefined;
  navAsOf = document.querySelector('meta[name="nav-as-of"]')?.getAttribute("content") ?? undefined;
  return navAsOf;
}
