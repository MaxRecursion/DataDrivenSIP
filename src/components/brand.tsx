/**
 * The name and the mark, which together are the page's header.
 *
 * Tithi is the Indian word for a calendar date, which is the one question this site answers. The
 * mark is the month the planner reasons about, drawn as twenty-eight dots (SIP dates run 1 to 28)
 * with one of them lit: the date it names. It is drawn from the theme's own tokens, so it follows
 * the palette and the light/dark switch without a second set of colours to keep in step; the
 * static copies in `public/` (favicon, apple-touch-icon, social image) use Marigold light.
 *
 * It sits in the same row as the search field rather than above it. The fund page is a one-screen
 * dashboard on large desktops with no vertical height to spare (e2e/wide.spec.ts), so a header
 * that added a line would be a layout regression on every fund.
 */
import { Link } from "react-router";
import { cn } from "../lib/utils";

const COLUMNS = 7;
const ROWS = 4;
/** Which of the 28 is lit: the 19th, off-centre on purpose so the mark reads as a pick, not a pattern. */
const LIT = 18;

export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  const dots = Array.from({ length: COLUMNS * ROWS }, (_, index) => ({
    index,
    x: 9 + (index % COLUMNS) * 5,
    y: 15.75 + Math.floor(index / COLUMNS) * 5.5,
  }));
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="48" height="48" rx="11" fill="var(--ink)" />
      {dots.map(({ index, x, y }) =>
        index === LIT ? (
          <circle key={index} cx={x} cy={y} r="3.4" fill="var(--marigold)" />
        ) : (
          <circle key={index} cx={x} cy={y} r="1.35" fill="var(--surface)" opacity="0.55" />
        ),
      )}
    </svg>
  );
}

/** `large` is the home page's masthead: the one place the name leads rather than sits in a row. */
export function Brand({ className, large = false }: { className?: string; large?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="Tithi, home"
      className={cn("flex shrink-0 items-center text-ink no-underline", large ? "gap-3.5" : "gap-2.5", className)}
    >
      <BrandMark size={large ? 52 : 32} />
      <span className={cn("font-display leading-none font-bold tracking-tight", large ? "text-5xl" : "text-2xl")}>
        Tithi
      </span>
    </Link>
  );
}
