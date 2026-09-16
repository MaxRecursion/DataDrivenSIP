/**
 * Title and og tags (spec §6.6). Link-preview crawlers read the prerendered HTML, so these
 * only matter for tabs, history and in-app navigation — but they have to stay in step.
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

export function setHead(head: { title: string; description: string; url?: string }): void {
  if (typeof document === "undefined") return;
  document.title = head.title;
  setMeta("name", "description", head.description);
  setMeta("property", "og:title", head.title);
  setMeta("property", "og:description", head.description);
  if (head.url) setMeta("property", "og:url", head.url);
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
