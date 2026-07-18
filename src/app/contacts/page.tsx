"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Contact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    fetch(`/api/contacts${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setContacts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
        <Link
          href="/contacts/new"
          className="rounded-md bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-500"
        >
          Add contact
        </Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, company, email, phone, or tag…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-slate-400">No contacts found.</p>
      ) : (
        <ul className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <Link
                href={`/contacts/${contact.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{contact.name}</p>
                  <p className="text-sm text-slate-500">
                    {[contact.role, contact.company].filter(Boolean).join(" at ")}
                  </p>
                </div>
                {contact.followUpDate && (
                  <span className="text-xs text-slate-500">
                    Follow up {new Date(contact.followUpDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
