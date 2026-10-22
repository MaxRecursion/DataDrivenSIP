/**
 * "I SIP on the Nth" — the reader's own date, remembered, and compared with the named one.
 *
 * It never changes the answer, and says so inline: the sentence beside it is the whole of the
 * guard against a reader assuming the page re-planned itself around their choice.
 */
import { writeSipDay } from "../lib/memory";
import { ordinal } from "../lib/format";

export function SipDaySelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (day: number) => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <label htmlFor="sip-day">I SIP on the</label>
      <select
        id="sip-day"
        className="min-h-10 rounded-full border border-line bg-neutral-100 px-3.5 py-1.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
        value={value ?? ""}
        onChange={(event) => {
          const day = Number(event.target.value);
          if (!Number.isInteger(day)) return;
          writeSipDay(day);
          onChange(day);
        }}
      >
        <option value="" disabled>
          day
        </option>
        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
          <option key={day} value={day}>
            {ordinal(day)}
          </option>
        ))}
      </select>
      <span className="text-mute-text">Does not change the named day.</span>
    </p>
  );
}
