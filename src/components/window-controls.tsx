/**
 * The two inputs that move the window (PLAN.md §6.4): when salary arrives, and how many days to
 * leave after it. Both are native form controls, so they work before any JavaScript chunk lands,
 * open as the platform's own picker on a phone, and cost nothing in bundle size.
 *
 * The disclosure is a native <details>. Radix Collapsible is the Phase 7 lazy chunk and isn't
 * imported here — and nothing in this file animates: a <details> opens instantly, which is the
 * only behaviour allowed anyway, since a height transition is not transform or opacity.
 *
 * Presentational and controlled: `onChange` hands the caller a whole new AppParams and the caller
 * writes it to the URL, which is where this state lives. The announcement of a change is not
 * here — it rides on the answer's own screen-reader summary in answer-block.tsx, because that
 * sentence is what actually changed for the reader.
 */
import { ordinal } from "../lib/format";
import { MAX_BUFFER, type AppParams, type Salary } from "../lib/url";

/** Salary can land on any calendar day; the window arithmetic folds 29-31 onto the 28-day circle. */
const SALARY_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

const BUFFER_DAYS = Array.from({ length: MAX_BUFFER + 1 }, (_, index) => index);

const SELECT_CLASS =
  "rounded-xl border border-line bg-raised px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal";

/** "last" is a real option value, not a sentinel for an empty field, so it round-trips as itself. */
function toSalary(value: string): Salary {
  return value === "last" ? "last" : Number(value);
}

function bufferLabel(days: number): string {
  if (days === 0) return "No wait";
  return days === 1 ? "1 day" : `${days} days`;
}

type WindowControlsProps = {
  params: AppParams;
  onChange: (next: AppParams) => void;
};

export function WindowControls({ params, onChange }: WindowControlsProps) {
  return (
    <div className="mt-8 flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="flex items-center gap-3 py-2">
        <label htmlFor="salary-day" className="text-sm text-mute-text">
          Salary arrives
        </label>
        <select
          id="salary-day"
          value={String(params.salary)}
          onChange={(event) => onChange({ ...params, salary: toSalary(event.target.value) })}
          className={SELECT_CLASS}
        >
          <option value="last">Last working day</option>
          {SALARY_DAYS.map((day) => (
            <option key={day} value={day}>
              {ordinal(day)}
            </option>
          ))}
        </select>
      </div>

      {/* Full width on a phone so it drops to its own line, inline once there is room for it. */}
      <details className="w-full sm:w-auto">
        <summary className="cursor-pointer py-2 text-sm text-mute-text outline-none select-none focus-visible:ring-2 focus-visible:ring-teal">
          Adjust buffer
        </summary>
        <div className="mt-3">
          <label htmlFor="buffer-days" className="block text-sm text-mute-text">
            Days to wait after your salary lands
          </label>
          <select
            id="buffer-days"
            value={String(params.buffer)}
            onChange={(event) => onChange({ ...params, buffer: Number(event.target.value) })}
            className={`mt-2 ${SELECT_CLASS}`}
          >
            {BUFFER_DAYS.map((days) => (
              <option key={days} value={days}>
                {bufferLabel(days)}
              </option>
            ))}
          </select>
        </div>
      </details>
    </div>
  );
}
