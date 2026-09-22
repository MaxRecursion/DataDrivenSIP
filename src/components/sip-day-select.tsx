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
    <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink 2xl:mt-0">
      <label htmlFor="sip-day">
        I SIP on the
        <select
          id="sip-day"
          className="mx-1.5 rounded-lg border border-line bg-raised px-2 py-1 text-ink focus-visible:ring-2 focus-visible:ring-teal"
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
      </label>
      <span className="text-mute-text">Does not change the named day.</span>
    </p>
  );
}
