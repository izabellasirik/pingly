import { TZDate } from "@date-fns/tz";

/** Hour of day (local) at which date-only reminders fire. */
export const DEFAULT_REMINDER_HOUR = 9;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : "UTC";
}

/** Parses "YYYY-MM-DD", rejecting impossible dates like 2026-02-30. */
export function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(value);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Is (month, day) a real calendar day in at least a leap year? */
export function isValidMonthDay(month: number, day: number): boolean {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(2024, month)
  );
}

/**
 * Converts a wall-clock time in `timeZone` to an absolute instant.
 * During a DST gap the time is moved forward to the next valid instant.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = parseDateOnly(date);
  const t = parseTime(time);
  if (!d || !t) return null;
  const zoned = new TZDate(d.year, d.month - 1, d.day, t.hour, t.minute, 0, safeTimeZone(timeZone));
  return new Date(zoned.getTime());
}

/** Local calendar date and time ("YYYY-MM-DD", "HH:mm") of an instant. */
export function utcToZonedParts(instant: Date, timeZone: string): { date: string; time: string } {
  const z = new TZDate(instant.getTime(), safeTimeZone(timeZone));
  return {
    date: `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`,
    time: `${pad(z.getHours())}:${pad(z.getMinutes())}`,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Adds whole calendar days to a "YYYY-MM-DD" string. */
export function addDaysToDate(date: string, days: number): string {
  const d = parseDateOnly(date);
  if (!d) throw new Error(`Invalid date: ${date}`);
  const u = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`;
}

/** Calendar-day difference (b − a) between two instants as seen in `timeZone`. */
export function calendarDaysBetween(a: Date, b: Date, timeZone: string): number {
  const da = utcToZonedParts(a, timeZone).date;
  const db = utcToZonedParts(b, timeZone).date;
  return Math.round((dateToUtcMidnight(db) - dateToUtcMidnight(da)) / 86_400_000);
}

function dateToUtcMidnight(date: string): number {
  const d = parseDateOnly(date)!;
  return Date.UTC(d.year, d.month - 1, d.day);
}

/** Start of the local day after `now` (exclusive end of "today"). */
export function endOfLocalDay(now: Date, timeZone: string): Date {
  const today = utcToZonedParts(now, timeZone).date;
  return zonedToUtc(addDaysToDate(today, 1), "00:00", timeZone)!;
}

/** Birthday date in a given year; Feb 29 falls back to Feb 28 in common years. */
export function birthdayInYear(year: number, month: number, day: number): string {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(safeDay)}`;
}

/** The next date (today or later, local) on which this birthday falls. */
export function nextBirthdayDate(month: number, day: number, now: Date, timeZone: string): string {
  const today = utcToZonedParts(now, timeZone).date;
  const year = Number(today.slice(0, 4));
  const thisYear = birthdayInYear(year, month, day);
  return thisYear >= today ? thisYear : birthdayInYear(year + 1, month, day);
}

/**
 * When a yearly birthday reminder fires: the morning before the next birthday,
 * so there is time to call, plan or buy a gift.
 */
export function birthdayReminderAt(month: number, day: number, now: Date, timeZone: string): Date {
  const birthday = nextBirthdayDate(month, day, now, timeZone);
  return zonedToUtc(addDaysToDate(birthday, -1), `${pad(DEFAULT_REMINDER_HOUR)}:00`, timeZone)!;
}

/** The birthday a reminder that fires at `remindAt` is about. */
export function birthdayForReminder(remindAt: Date, timeZone: string): string {
  return addDaysToDate(utcToZonedParts(remindAt, timeZone).date, 1);
}

/** Same local wall-clock time, one year later (Feb 29 → Feb 28). */
export function addOneYearLocal(instant: Date, timeZone: string): Date {
  const { date, time } = utcToZonedParts(instant, timeZone);
  const d = parseDateOnly(date)!;
  return zonedToUtc(birthdayInYear(d.year + 1, d.month, d.day), time, timeZone)!;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Today", "Tomorrow", "Thursday", "3 days ago", "Oct 24" … for a local date. */
export function relativeDayLabel(date: string, now: Date, timeZone: string): string {
  const today = utcToZonedParts(now, timeZone).date;
  const diff = Math.round((dateToUtcMidnight(date) - dateToUtcMidnight(today)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < -1) return `${-diff} days ago`;
  const utc = new Date(dateToUtcMidnight(date));
  if (diff < 7) return WEEKDAY.format(utc);
  return date.slice(0, 4) === today.slice(0, 4) ? SHORT_DATE.format(utc) : SHORT_DATE_YEAR.format(utc);
}

export function formatMonthDay(month: number, day: number, year?: number | null): string {
  const utc = new Date(Date.UTC(year ?? 2024, month - 1, day));
  return year ? SHORT_DATE_YEAR.format(utc) : SHORT_DATE.format(utc);
}

export function formatDate(date: string): string {
  return SHORT_DATE_YEAR.format(new Date(dateToUtcMidnight(date)));
}

/** "6:00 PM" from "18:00". */
export function formatTime(time: string): string {
  const t = parseTime(time);
  if (!t) return time;
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${h12}:${pad(t.minute)} ${t.hour < 12 ? "AM" : "PM"}`;
}

/** "Tuesday, October 13, 2026, 2:05 PM" — context for the AI and emails. */
export function describeNow(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeTimeZone(timeZone),
  }).format(now);
}
