import {
  DEFAULT_REMINDER_HOUR,
  addDaysToDate,
  addOneYearLocal,
  birthdayReminderAt,
  endOfLocalDay,
  utcToZonedParts,
  zonedToUtc,
} from "@/lib/dates";

export type ReminderKind = "birthday" | "follow_up" | "check_in" | "custom";
export type Recurrence = "none" | "yearly";

export const KIND_EMOJI: Record<ReminderKind, string> = {
  birthday: "🎂",
  follow_up: "💬",
  check_in: "👋",
  custom: "🔔",
};

export const KIND_LABEL: Record<ReminderKind, string> = {
  birthday: "Birthday",
  follow_up: "Follow up",
  check_in: "Check in",
  custom: "Reminder",
};

/** How far ahead "Coming up" looks on the Today screen. */
export const UPCOMING_DAYS = 14;

type Schedulable = {
  kind: string;
  recurrence: string;
  remind_at: string;
};

type BirthdayPerson = { birthday_month: number | null; birthday_day: number | null } | null;

/**
 * When a yearly reminder is completed, it moves to its next occurrence.
 * Birthday reminders are re-derived from the person's birthday so they stay
 * correct even if they were snoozed; other yearly reminders keep their time.
 */
export function nextOccurrenceAfterDone(
  reminder: Schedulable,
  person: BirthdayPerson,
  now: Date,
  timeZone: string,
): Date | null {
  if (reminder.recurrence !== "yearly") return null;
  const current = new Date(reminder.remind_at);
  if (reminder.kind === "birthday" && person?.birthday_month && person.birthday_day) {
    // Look for the birthday after the one this reminder was about.
    const after = new Date(Math.max(now.getTime(), current.getTime()) + 2 * 86_400_000);
    return birthdayReminderAt(person.birthday_month, person.birthday_day, after, timeZone);
  }
  let next = addOneYearLocal(current, timeZone);
  while (next.getTime() <= now.getTime()) next = addOneYearLocal(next, timeZone);
  return next;
}

export type SnoozeOption = { key: "later" | "tomorrow" | "weekend" | "next_week"; label: string };

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { key: "later", label: "In 3 hours" },
  { key: "tomorrow", label: "Tomorrow morning" },
  { key: "weekend", label: "This weekend" },
  { key: "next_week", label: "Next week" },
];

const HOUR = `${String(DEFAULT_REMINDER_HOUR).padStart(2, "0")}:00`;

export function snoozeUntil(key: SnoozeOption["key"], now: Date, timeZone: string): Date {
  const today = utcToZonedParts(now, timeZone).date;
  switch (key) {
    case "later":
      return new Date(roundUpToMinute(now.getTime() + 3 * 3_600_000));
    case "tomorrow":
      return zonedToUtc(addDaysToDate(today, 1), HOUR, timeZone)!;
    case "weekend": {
      // Next Saturday (or the one after, if today is Saturday).
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      const days = dow === 6 ? 7 : (6 - dow + 7) % 7 || 7;
      return zonedToUtc(addDaysToDate(today, days), HOUR, timeZone)!;
    }
    case "next_week":
      return zonedToUtc(addDaysToDate(today, 7), HOUR, timeZone)!;
  }
}

function roundUpToMinute(ms: number): number {
  return Math.ceil(ms / 60_000) * 60_000;
}

export type TodaySections<T> = { today: T[]; upcoming: T[] };

/**
 * Splits active reminders for the Today screen: everything due before the end
 * of the user's local day (including overdue), and what's coming in the next
 * two weeks.
 */
export function groupForToday<T extends { remind_at: string }>(
  reminders: T[],
  now: Date,
  timeZone: string,
): TodaySections<T> {
  const endOfToday = endOfLocalDay(now, timeZone).getTime();
  const horizon = endOfToday + UPCOMING_DAYS * 86_400_000;
  const sorted = [...reminders].sort(
    (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime(),
  );
  const today: T[] = [];
  const upcoming: T[] = [];
  for (const r of sorted) {
    const t = new Date(r.remind_at).getTime();
    if (t < endOfToday) today.push(r);
    else if (t < horizon) upcoming.push(r);
  }
  return { today, upcoming };
}
