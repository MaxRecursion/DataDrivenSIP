/**
 * Clock-dependent sentence comparing today's date to the named SIP day. Empty until mount.
 */
import { todayCopy } from "../lib/compare";
import { useToday } from "../lib/use-today";
import type { DateResult } from "../../shared/artifacts";

export function TodayLine({ named, dates }: { named: DateResult; dates: readonly DateResult[] }) {
  const { day, ready } = useToday();
  if (!ready || day === null) return null;
  const todayRow = dates.find((row) => row.d === day);
  return (
    <p className="mt-3 text-sm leading-relaxed text-mute-text 2xl:mt-0">{todayCopy(day, named, todayRow)}</p>
  );
}
