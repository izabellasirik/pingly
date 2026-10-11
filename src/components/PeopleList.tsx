"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Avatar } from "@/components/Avatar";

export type PersonRow = { id: string; name: string; relationship: string | null; birthday: string | null };

export function PeopleList({ people }: { people: PersonRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.relationship ?? "").toLowerCase().includes(q),
    );
  }, [people, query]);

  return (
    <div className="space-y-4">
      <label className="card flex items-center gap-2 px-4">
        <Search className="size-5 text-muted" aria-hidden />
        <span className="sr-only">Search people</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${people.length} ${people.length === 1 ? "person" : "people"}`}
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-muted"
        />
      </label>
      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-[15px] text-muted">No one matches “{query}”.</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/people/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                <Avatar name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{p.name}</span>
                  {(p.relationship || p.birthday) && (
                    <span className="block truncate text-[13px] text-muted">
                      {[p.relationship, p.birthday && `🎂 ${p.birthday}`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
