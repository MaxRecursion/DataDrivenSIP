/**
 * Mobile-only summary of the answer, so it stays in view after the calendar.
 * Hidden from 2xl, where the four-column page already shows the heading.
 */
export function StickyAnswer({ text }: { text: string }) {
  return (
    <div
      data-sticky-answer=""
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-raised/95 px-5 py-3 text-sm text-ink 2xl:hidden"
    >
      <p className="font-display font-bold">{text}</p>
    </div>
  );
}
