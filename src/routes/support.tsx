/**
 * Where the footer's tip link lands. Tips are not open yet: this page says so, and a visit here
 * is the interest signal (the server's request count for /support, no script on the page).
 * Nothing is collected and no payment is taken. Kept out of the index; it is not a page to find.
 */
import { useEffect } from "react";
import { Link } from "react-router";
import { ROBOTS_NOINDEX, SITE_NAME } from "../lib/seo";

export function SupportPage() {
  useEffect(() => {
    document.title = `Tips aren’t open yet — ${SITE_NAME}`;
    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.append(robots);
    }
    robots.setAttribute("content", ROBOTS_NOINDEX);
  }, []);

  return (
    <section className="max-w-[65ch]">
      <h1 className="font-display text-3xl leading-tight font-bold text-balance">
        Tips aren’t open yet
      </h1>
      <p className="mt-3 text-mute-text">
        {SITE_NAME} is free and has no ads. A tip link is being tried to see whether anyone
        would want one, and you’ve just told us you might. Nothing was charged and nothing
        was collected.
      </p>
      <p className="mt-3 text-mute-text">
        If enough people tap it, a real way to say thanks will go up here.
      </p>
      <p className="mt-6">
        <Link to="/" className="underline decoration-line underline-offset-2">
          Back to the date finder
        </Link>
      </p>
    </section>
  );
}
