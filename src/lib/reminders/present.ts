import {
  birthdayForReminder,
  calendarDaysBetween,
  formatMonthDay,
  formatTime,
  relativeDayLabel,
  utcToZonedParts,
  zonedToUtc,
} from "@/lib/dates";
import type { ReminderCardData } from "@/components/ReminderCard";
import { KIND_EMOJI, type ReminderKind } from "./logic";

type Input = {
  id: string;
  title: string;
  note: string | null;
  kind: string;
  recurrence: string;
  remind_at: string;
  person: { id: string; name: string } | null;
};

function asKind(kind: string): ReminderKind {
  return (["birthday", "follow_up", "check_in", "custom"] as const).includes(kind as ReminderKind)
    ? (kind as ReminderKind)
    : "custom";
}

const ask = (q: string) => `/ask?q=${encodeURIComponent(q)}`;

/** Turns a reminder into what the Today card shows. Context only uses saved data. */
export function presentReminder(
  r: Input,
  memories: string[],
  now: Date,
  timeZone: string,
): ReminderCardData {
  const kind = asKind(r.kind);
  const at = new Date(r.remind_at);
  const { date, time } = utcToZonedParts(at, timeZone);
  const name = r.person?.name ?? null;
  const first = name?.split(/\s+/)[0] ?? null;

  let headline = r.title;
  let when: string;
  let overdue = false;

  if (kind === "birthday") {
    const birthday = birthdayForReminder(at, timeZone);
    const label = relativeDayLabel(birthday, now, timeZone);
    const days = calendarDaysBetween(now, zonedToUtc(birthday, "12:00", timeZone)!, timeZone);
    const past = label === "Yesterday" || label.endsWith("ago");
    const monthDay = formatMonthDay(Number(birthday.slice(5, 7)), Number(birthday.slice(8, 10)));
    if (past) headline = `${r.title} was ${label.toLowerCase()}`;
    else if (label === "Today" || label === "Tomorrow") headline = `${r.title} is ${label.toLowerCase()}`;
    else if (days < 7) headline = `${r.title} is on ${label}`;
    when = label === "Today" || label === "Tomorrow" || days < 7 ? `${label} · ${monthDay}` : monthDay;
    overdue = past;
  } else {
    const label = relativeDayLabel(date, now, timeZone);
    overdue = at.getTime() < now.getTime();
    when = `${label} · ${formatTime(time)}`;
  }

  const context = r.note || (memories.length ? memories.join(" · ") : null);

  let action: ReminderCardData["action"] = null;
  if (name) {
    if (kind === "birthday") action = { label: "Gift ideas", href: ask(`What should I get ${name} for their birthday?`) };
    else if (kind === "follow_up") action = { label: "Draft follow-up", href: ask(`Draft a friendly follow-up message to ${name} about: ${r.title}`) };
    else if (kind === "check_in") action = { label: "Draft message", href: ask(`Write a short, warm check-in message to ${first}`) };
    else action = { label: `About ${first}`, href: ask(`What do I remember about ${name}?`) };
  }

  return {
    id: r.id,
    emoji: KIND_EMOJI[kind],
    headline,
    context,
    when,
    overdue,
    recurring: r.recurrence === "yearly",
    person: r.person ? { id: r.person.id, name: r.person.name } : null,
    action,
  };
}
