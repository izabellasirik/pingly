import Link from "next/link";
import { Suspense } from "react";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProfile, latestMemoriesFor, listActiveReminders } from "@/lib/data";
import { describeNow } from "@/lib/dates";
import { groupForToday } from "@/lib/reminders/logic";
import { presentReminder } from "@/lib/reminders/present";
import { CaptureBox } from "@/components/CaptureBox";
import { ReminderCard } from "@/components/ReminderCard";
import { LineSkeleton, ListSkeleton } from "@/components/Skeletons";

export default function TodayPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LineSkeleton className="mt-2 h-14 w-64" />}>
        <Greeting />
      </Suspense>
      <CaptureBox />
      <Suspense fallback={<ListSkeleton />}>
        <TodayReminders />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const user = await requireUser();
  const profile = await getProfile(user);
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: profile.timezone }).format(now),
  );
  const part = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = profile.display_name?.split(/\s+/)[0];
  const date = describeNow(now, profile.timezone).split(",").slice(0, 2).join(",");
  return (
    <div className="pt-2">
      <p className="text-[13px] font-medium uppercase tracking-wide text-muted">{date}</p>
      <h1 className="mt-1 text-[28px] font-bold tracking-tight">
        {part}
        {name ? `, ${name}` : ""}
      </h1>
    </div>
  );
}

async function TodayReminders() {
  const user = await requireUser();
  const [profile, reminders] = await Promise.all([getProfile(user), listActiveReminders(user)]);
  const now = new Date();
  const { today, upcoming } = groupForToday(reminders, now, profile.timezone);
  const personIds = [...new Set([...today, ...upcoming].map((r) => r.person_id).filter((id): id is string => !!id))];
  const memories = await latestMemoriesFor(user, personIds);
  const present = (r: (typeof reminders)[number]) =>
    presentReminder(r, r.person_id ? (memories.get(r.person_id) ?? []) : [], now, profile.timezone);

  if (today.length === 0 && upcoming.length === 0) {
    const { count } = await user.supabase.from("people").select("id", { count: "exact", head: true });
    return <EmptyToday hasPeople={(count ?? 0) > 0} />;
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="section-title">
          Today
        </h2>
        {today.length > 0 ? (
          <div className="space-y-3">
            {today.map((r) => (
              <ReminderCard key={r.id} data={present(r)} />
            ))}
          </div>
        ) : (
          <p className="card p-5 text-[15px] text-muted">Nothing due today. Enjoy it ✨</p>
        )}
      </section>
      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="section-title">
            Coming up
          </h2>
          <div className="space-y-3">
            {upcoming.map((r) => (
              <ReminderCard key={r.id} data={present(r)} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyToday({ hasPeople }: { hasPeople: boolean }) {
  return (
    <div className="card animate-in px-6 py-10 text-center">
      <div className="text-4xl" aria-hidden>
        {hasPeople ? "✨" : "👋"}
      </div>
      <h2 className="mt-3 text-xl font-semibold">{hasPeople ? "You're all caught up" : "Welcome to Pingly"}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
        {hasPeople
          ? "No reminders for the next two weeks. Try “Remind me to check in with Sarah in two weeks.”"
          : "Tell Pingly about someone above — like “I met Emily today. She’s a designer and loves hiking.” — and it will remember for you."}
      </p>
      {!hasPeople && (
        <Link href="/people/new" className="btn-soft mt-5">
          <UserPlus className="size-4" aria-hidden />
          Add a person
        </Link>
      )}
    </div>
  );
}
