"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format, isBefore, isToday, startOfDay } from "date-fns";
import type { Contact } from "@/lib/types";

export default function UpcomingFollowUps() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contacts?upcomingFollowUps=true")
      .then((res) => res.json())
      .then((data) => setContacts(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (contacts.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No follow-ups scheduled. Set a follow-up date on a contact to see it here.
      </p>
    );
  }

  const today = startOfDay(new Date());

  return (
    <ul className="divide-y divide-slate-100">
      {contacts.map((contact) => {
        const dueDate = startOfDay(new Date(contact.followUpDate as string));
        const overdue = isBefore(dueDate, today);
        const due = isToday(dueDate);
        return (
          <li key={contact.id} className="py-2.5 flex items-center justify-between">
            <div>
              <Link href={`/contacts/${contact.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                {contact.name}
              </Link>
              {contact.company && <span className="text-sm text-slate-500"> · {contact.company}</span>}
            </div>
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                overdue
                  ? "bg-red-100 text-red-700"
                  : due
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {overdue ? "Overdue · " : due ? "Today · " : ""}
              {format(dueDate, "MMM d")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
