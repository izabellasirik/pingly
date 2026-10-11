import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listPeople } from "@/lib/data";
import { formatMonthDay } from "@/lib/dates";
import { PeopleList } from "@/components/PeopleList";
import { ListSkeleton } from "@/components/Skeletons";

export const metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">People</h1>
        <Link href="/people/new" className="btn-primary btn-sm">
          <Plus className="size-4" aria-hidden />
          Add
        </Link>
      </div>
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <People />
      </Suspense>
    </div>
  );
}

async function People() {
  const user = await requireUser();
  const people = await listPeople(user);
  if (people.length === 0) {
    return (
      <div className="card animate-in px-6 py-10 text-center">
        <div className="text-4xl" aria-hidden>
          🫶
        </div>
        <h2 className="mt-3 text-xl font-semibold">No one here yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
          Add someone you care about, or just tell Pingly about them in Ask AI.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/people/new" className="btn-primary">
            Add a person
          </Link>
          <Link href="/ask" className="btn-soft">
            Tell Pingly
          </Link>
        </div>
      </div>
    );
  }
  return (
    <PeopleList
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        birthday: p.birthday_month && p.birthday_day ? formatMonthDay(p.birthday_month, p.birthday_day) : null,
      }))}
    />
  );
}
