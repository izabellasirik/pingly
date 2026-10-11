"use client";

import { useState, useTransition } from "react";
import { Bell, Pencil, Plus, Trash2 } from "lucide-react";
import { deletePersonAction, updatePersonAction } from "@/app/actions/people";
import { addBirthdayReminderAction } from "@/app/actions/reminders";
import { PersonForm } from "@/components/PersonForm";
import { ReminderForm } from "@/components/ReminderForm";
import type { Person } from "@/lib/data";

export function EditPerson({ person, hasBirthdayReminder }: { person: Person; hasBirthdayReminder: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-soft btn-sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" aria-hidden />
        Edit
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Edit ${person.name}`}>
      <div className="card animate-in max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-3xl">
        <h2 className="mb-4 text-xl font-semibold">Edit {person.name}</h2>
        <PersonForm
          action={async (state, form) => {
            const res = await updatePersonAction(person.id, state, form);
            if (res?.ok) setOpen(false);
            return res;
          }}
          initial={person}
          submitLabel="Save changes"
          hasBirthdayReminder={hasBirthdayReminder}
          onCancel={() => setOpen(false)}
        />
      </div>
    </div>
  );
}

export function AddBirthdayReminder({ personId }: { personId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm !text-accent"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addBirthdayReminderAction(personId);
            if (res?.error) setError(res.error);
          })
        }
      >
        <Bell className="size-4" aria-hidden />
        Remind me yearly
      </button>
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </>
  );
}

export function NewReminder({ personId, firstName, defaultDate }: { personId: string; firstName: string; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-soft btn-sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Add reminder
      </button>
    );
  }
  return (
    <div className="card animate-in p-5">
      <ReminderForm personId={personId} defaultTitle={`Check in with ${firstName}`} defaultDate={defaultDate} onDone={() => setOpen(false)} />
      <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

export function DeletePerson({ personId, name }: { personId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return (
      <button type="button" className="btn-ghost btn-sm hover:!text-danger" onClick={() => setConfirming(true)}>
        <Trash2 className="size-4" aria-hidden />
        Delete {name}
      </button>
    );
  }
  return (
    <div className="card p-4 text-[15px]">
      <p>
        Delete <strong>{name}</strong> and everything you saved about them? This can’t be undone.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn bg-danger text-white btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deletePersonAction(personId);
              if (res?.error) setError(res.error);
            })
          }
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
