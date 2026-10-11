import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Mail, Phone, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPerson, getProfile, listMemories, listPersonReminders } from "@/lib/data";
import { addDaysToDate, formatDate, formatMonthDay, utcToZonedParts } from "@/lib/dates";
import { presentReminder } from "@/lib/reminders/present";
import { Avatar } from "@/components/Avatar";
import { Memories } from "@/components/Memories";
import { AddBirthdayReminder, DeletePerson, EditPerson, NewReminder } from "@/components/PersonActions";
import { ReminderCard } from "@/components/ReminderCard";
import { LineSkeleton, ListSkeleton } from "@/components/Skeletons";

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="space-y-6 pt-1">
      <Link href="/people" className="btn-ghost -ml-3 !px-3">
        <ChevronLeft className="size-5" aria-hidden />
        People
      </Link>
      <Suspense
        fallback={
          <div className="space-y-6">
            <LineSkeleton className="h-16 w-64" />
            <ListSkeleton rows={2} />
          </div>
        }
      >
        <PersonView params={params} />
      </Suspense>
    </div>
  );
}

async function PersonView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const person = await getPerson(user, id);
  if (!person) notFound();

  const [profile, memories, reminders] = await Promise.all([
    getProfile(user),
    listMemories(user, person.id),
    listPersonReminders(user, person.id),
  ]);
  const tz = profile.timezone;
  const now = new Date();
  const firstName = person.name.split(/\s+/)[0];
  const hasBirthday = Boolean(person.birthday_month && person.birthday_day);
  const hasBirthdayReminder = reminders.active.some((r) => r.kind === "birthday");
  const today = utcToZonedParts(now, tz).date;

  return (
    <>
      <header className="flex items-center gap-4">
        <Avatar name={person.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] font-bold tracking-tight">{person.name}</h1>
          {person.relationship && <p className="text-[15px] text-muted">{person.relationship}</p>}
        </div>
        <EditPerson person={person} hasBirthdayReminder={hasBirthdayReminder} />
      </header>

      <div className="card divide-y divide-line">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[15px]">
          <span aria-hidden>🎂</span>
          {hasBirthday ? (
            <span>{formatMonthDay(person.birthday_month!, person.birthday_day!, person.birthday_year)}</span>
          ) : (
            <span className="text-muted">Birthday not saved</span>
          )}
          {hasBirthday && !hasBirthdayReminder && <AddBirthdayReminder personId={person.id} />}
          {hasBirthdayReminder && <span className="text-[13px] text-muted">· reminder on</span>}
        </div>
        {person.email && (
          <a href={`mailto:${person.email}`} className="flex items-center gap-3 px-4 py-3 text-[15px] hover:bg-surface-2">
            <Mail className="size-4 text-muted" aria-hidden />
            {person.email}
          </a>
        )}
        {person.phone && (
          <a href={`tel:${person.phone}`} className="flex items-center gap-3 px-4 py-3 text-[15px] hover:bg-surface-2">
            <Phone className="size-4 text-muted" aria-hidden />
            {person.phone}
          </a>
        )}
      </div>

      <Link href={`/ask?q=${encodeURIComponent(`What do I remember about ${person.name}?`)}`} className="btn-accent w-full">
        <Sparkles className="size-4" aria-hidden />
        Ask Pingly about {firstName}
      </Link>

      <Memories
        personId={person.id}
        firstName={firstName}
        memories={memories.map((m) => ({
          id: m.id,
          content: m.content,
          added: `Added ${formatDate(utcToZonedParts(new Date(m.created_at), tz).date)}`,
        }))}
      />

      <section aria-labelledby={`reminders-${person.id}`} className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id={`reminders-${person.id}`} className="section-title !mb-0">
            Reminders
          </h2>
          <NewReminder personId={person.id} firstName={firstName} defaultDate={addDaysToDate(today, 1)} />
        </div>
        {reminders.active.length === 0 ? (
          <p className="card p-4 text-[15px] text-muted">No upcoming reminders for {firstName}.</p>
        ) : (
          reminders.active.map((r) => (
            <ReminderCard
              key={r.id}
              compact
              data={presentReminder({ ...r, person: { id: person.id, name: person.name } }, [], now, tz)}
            />
          ))
        )}
      </section>

      {reminders.history.length > 0 && (
        <section aria-labelledby={`history-${person.id}`}>
          <h2 id={`history-${person.id}`} className="section-title">
            History
          </h2>
          <ul className="card divide-y divide-line">
            {reminders.history.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                <span className="min-w-0 truncate">
                  <span className="text-success" aria-hidden>
                    ✓{" "}
                  </span>
                  {r.title}
                </span>
                <span className="shrink-0 text-[13px] text-muted">
                  {formatDate(utcToZonedParts(new Date(r.completed_at ?? r.remind_at), tz).date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pt-4">
        <DeletePerson personId={person.id} name={person.name} />
      </div>
    </>
  );
}
