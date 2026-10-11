"use client";

import { useActionState, useId, useState } from "react";
import type { FormState } from "@/app/actions/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RELATIONSHIPS = ["Friend", "Family", "Mom", "Dad", "Partner", "Sister", "Brother", "Coworker", "Client", "Neighbor"];

type Initial = {
  name?: string;
  relationship?: string | null;
  birthday_month?: number | null;
  birthday_day?: number | null;
  birthday_year?: number | null;
  email?: string | null;
  phone?: string | null;
};

export function PersonForm({
  action,
  initial = {},
  submitLabel,
  showMemory = false,
  hasBirthdayReminder = false,
  onCancel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: Initial;
  submitLabel: string;
  showMemory?: boolean;
  hasBirthdayReminder?: boolean;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [month, setMonth] = useState(initial.birthday_month ? String(initial.birthday_month) : "");

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor={id("name")}>
          Name
        </label>
        <input id={id("name")} name="name" className="field" defaultValue={initial.name} required maxLength={120} autoComplete="off" autoFocus={!initial.name} />
      </div>
      <div>
        <label className="label" htmlFor={id("relationship")}>
          Relationship
        </label>
        <input
          id={id("relationship")}
          name="relationship"
          className="field"
          list={id("relationships")}
          defaultValue={initial.relationship ?? ""}
          placeholder="Friend, Mom, Client…"
          maxLength={60}
          autoComplete="off"
        />
        <datalist id={id("relationships")}>
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>
      <fieldset>
        <legend className="label">Birthday (optional)</legend>
        <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
          <select name="birthday_month" className="field" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Birthday month">
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select name="birthday_day" className="field" defaultValue={initial.birthday_day ?? ""} aria-label="Birthday day">
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <input
            name="birthday_year"
            className="field"
            inputMode="numeric"
            placeholder="Year"
            defaultValue={initial.birthday_year ?? ""}
            pattern="(19|20)[0-9]{2}"
            aria-label="Birthday year (optional)"
          />
        </div>
        {month && !hasBirthdayReminder && (
          <label className="mt-3 flex items-center gap-2 text-[15px]">
            <input type="checkbox" name="birthday_reminder" defaultChecked className="size-4 accent-[var(--accent)]" />
            Remind me every year, the day before
          </label>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={id("email")}>
            Email (optional)
          </label>
          <input id={id("email")} name="email" type="email" className="field" defaultValue={initial.email ?? ""} autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor={id("phone")}>
            Phone (optional)
          </label>
          <input id={id("phone")} name="phone" type="tel" className="field" defaultValue={initial.phone ?? ""} autoComplete="off" />
        </div>
      </div>
      {showMemory && (
        <div>
          <label className="label" htmlFor={id("memory")}>
            Something to remember (optional)
          </label>
          <textarea id={id("memory")} name="memory" className="field min-h-24" placeholder={"Loves tennis\nWants to visit Italy"} maxLength={2000} />
          <p className="mt-1 text-[12px] text-muted">One memory per line.</p>
        </div>
      )}
      {state?.error && (
        <p role="alert" className="text-[14px] text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && <p className="text-[14px] text-success">{state.message}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
