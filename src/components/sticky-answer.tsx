/**
 * Mobile-only summary of the answer, so it stays in view after the calendar.
 * Hidden from 2xl, where the four-column page already shows the heading.
 *
 * Opaque, not translucent. The card and the page are two steps of the same cream in Organic,
 * so a 95% bar let the text underneath read straight through it. The shadow does the
 * separating instead — static, never transitioned, like every other shadow here.
 */
export function StickyAnswer({ text }: { text: string }) {
  return (
    <div
      data-sticky-answer=""
      className="fixed inset-x-0 bottom-0 z-10 bg-raised px-5 py-3 text-sm text-ink shadow-bar 2xl:hidden"
    >
      <p className="font-display">{text}</p>
    </div>
  );
}
