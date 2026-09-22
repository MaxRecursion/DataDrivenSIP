/**
 * The calendar's two clock reads: the current month and today's date, clamped to the 28th.
 * Null until after mount so prerendered HTML is not the build machine's day (PLAN.md).
 */
import { useEffect, useState } from "react";
import { baselineDate, calendarDayInIndia, monthOf, monthsAhead, type MonthKey } from "./calendar";

export function useToday(): { months: MonthKey[]; baseline: number | null; ready: boolean; day: number | null } {
  const [today, setToday] = useState<{ month: MonthKey; baseline: number; day: number } | null>(null);
  useEffect(() => {
    const now = new Date();
    setToday({ month: monthOf(now), baseline: baselineDate(now), day: calendarDayInIndia(now) });
  }, []);
  return {
    months: today ? monthsAhead(today.month) : [],
    baseline: today?.baseline ?? null,
    day: today?.day ?? null,
    ready: today !== null,
  };
}
