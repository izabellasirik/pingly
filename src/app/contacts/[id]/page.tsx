"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import type { ContactWithInteractions } from "@/lib/types";
import ContactForm, { type ContactFormValues } from "@/components/ContactForm";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<ContactWithInteractions | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    const res = await fetch(`/api/contacts/${params.id}`);
    if (res.status === 404) {
      setContact(null);
      setLoading(false);
      return;
    }
    setContact(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleUpdate(values: ContactFormValues) {
    const res = await fetch(`/api/contacts/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        followUpDate: values.followUpDate ? new Date(values.followUpDate).toISOString() : null,
      }),
    });
    if (!res.ok) throw new Error("Failed to update contact");
    setEditing(false);
    load();
  }

  async function handleDelete() {
    if (!confirm(`Delete ${contact?.name}? This can't be undone.`)) return;
    await fetch(`/api/contacts/${params.id}`, { method: "DELETE" });
    router.push("/contacts");
    router.refresh();
  }

  async function handleAddNote(e: FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await fetch(`/api/contacts/${params.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText }),
      });
      setNoteText("");
      load();
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!contact) {
    return (
      <div className="space-y-4">
        <p className="text-slate-600">Contact not found.</p>
        <Link href="/contacts" className="text-indigo-600 hover:underline text-sm">
          Back to contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/contacts" className="text-sm text-slate-500 hover:text-slate-700">
          ← All contacts
        </Link>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="rounded-md border border-red-200 text-red-600 text-sm font-medium px-3 py-1.5 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <ContactForm
            initial={contact}
            submitLabel="Save changes"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{contact.name}</h1>
              {(contact.role || contact.company) && (
                <p className="text-slate-500">{[contact.role, contact.company].filter(Boolean).join(" at ")}</p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              {contact.phone && (
                <div>
                  <dt className="text-slate-400">Phone</dt>
                  <dd className="text-slate-800">{contact.phone}</dd>
                </div>
              )}
              {contact.email && (
                <div>
                  <dt className="text-slate-400">Email</dt>
                  <dd className="text-slate-800">{contact.email}</dd>
                </div>
              )}
              {contact.followUpDate && (
                <div>
                  <dt className="text-slate-400">Follow-up date</dt>
                  <dd className="text-slate-800">{format(new Date(contact.followUpDate), "MMM d, yyyy")}</dd>
                </div>
              )}
              {contact.lastContactedAt && (
                <div>
                  <dt className="text-slate-400">Last contacted</dt>
                  <dd className="text-slate-800">{format(new Date(contact.lastContactedAt), "MMM d, yyyy")}</dd>
                </div>
              )}
              {contact.tags && (
                <div className="col-span-2">
                  <dt className="text-slate-400">Tags</dt>
                  <dd className="text-slate-800">{contact.tags}</dd>
                </div>
              )}
            </dl>

            {contact.notes && (
              <div>
                <dt className="text-slate-400 text-sm">Notes</dt>
                <dd className="text-slate-800 text-sm whitespace-pre-wrap">{contact.notes}</dd>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <h2 className="font-semibold text-slate-900">Interaction history</h2>
            <form onSubmit={handleAddNote} className="flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Log a conversation or note…"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={savingNote}
                className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 hover:bg-slate-800"
              >
                Log
              </button>
            </form>

            {contact.interactions.length === 0 ? (
              <p className="text-sm text-slate-400">No interactions logged yet.</p>
            ) : (
              <ul className="space-y-3">
                {contact.interactions.map((interaction) => (
                  <li key={interaction.id} className="text-sm border-l-2 border-slate-200 pl-3">
                    <p className="text-slate-400">{format(new Date(interaction.date), "MMM d, yyyy · h:mm a")}</p>
                    <p className="text-slate-800">{interaction.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
