/**
 * The wordmark's mark: twenty-eight dots, one per SIP date, with the named day picked out.
 *
 * Four rows of seven is not a decorative grid — it is exactly the 1-28 the engine considers,
 * which is why the shape can stand for the product at all. The dot at row three, column five
 * is drawn larger and in the accent instead of the quiet fill: the day the page is about.
 *
 * Decorative, so it carries no accessible name of its own; the link around it is labelled.
 * Painted from the same CSS variables as the page, so it can never drift from the palette,
 * and nothing here moves.
 */
const COLUMNS = [9, 14, 19, 24, 29, 34, 39];
const ROWS = [15.75, 21.25, 26.75, 32.25];
/** Row three, column five. The one dot that is the answer rather than a date. */
const NAMED = { x: 29, y: 26.75 };

export function LogoMark({ size = 34, className }: { size?: number; className?: string | undefined }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="16" fill="var(--ink)" />
      <g fill="var(--surface)" opacity="0.55">
        {ROWS.flatMap((y) =>
          COLUMNS.filter((x) => !(x === NAMED.x && y === NAMED.y)).map((x) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />
          )),
        )}
      </g>
      <circle cx={NAMED.x} cy={NAMED.y} r="3.6" fill="var(--down)" />
    </svg>
  );
}

/** The mark and the name, as one row. The caller supplies the link and its label. */
export function Wordmark({ size = 34, type = "1.625rem" }: { size?: number; type?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} className="block flex-none" />
      <span className="font-display leading-none" style={{ fontSize: type }}>
        Tithi
      </span>
    </span>
  );
}
