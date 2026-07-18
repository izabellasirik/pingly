import { addDays, startOfDay, startOfWeek, endOfWeek, format } from "date-fns";

/** Monday-start week helpers, used to bucket WeeklyTask rows. */

export function getWeekStart(date: Date): Date {
  return startOfWeek(startOfDay(date), { weekStartsOn: 1 });
}

export function getWeekEnd(date: Date): Date {
  return endOfWeek(startOfDay(date), { weekStartsOn: 1 });
}

export function shiftWeek(weekStart: Date, deltaWeeks: number): Date {
  return addDays(weekStart, deltaWeeks * 7);
}

export function formatWeekLabel(weekStart: Date): string {
  const end = getWeekEnd(weekStart);
  return `${format(weekStart, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

/** Parse a "yyyy-MM-dd" style date param into a Date at local midnight, defaulting to today. */
export function parseDateParam(value: string | null): Date {
  if (!value) return startOfDay(new Date());
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return startOfDay(new Date());
  return startOfDay(parsed);
}

export function toDateParam(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
