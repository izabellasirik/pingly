"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/app/actions/types";

type Field = { name: string; label: string; type: string; autoComplete?: string; minLength?: number };

export function AuthForm({
  action,
  fields,
  submitLabel,
  withTimezone = false,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
  withTimezone?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // Unique ids: Next keeps recently visited pages mounted (hidden), so plain
  // ids like "email" could collide across pages.
  const uid = useId();

  if (state?.ok && state.message) {
    return (
      <p className="rounded-2xl bg-accent-soft p-4 text-[15px]" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <form
      action={(form: FormData) => {
        // The account's time zone starts as this device's.
        if (withTimezone) form.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        return formAction(form);
      }}
      className="space-y-4"
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={`${uid}-${f.name}`}>
            {f.label}
          </label>
          <input
            id={`${uid}-${f.name}`}
            name={f.name}
            type={f.type}
            className="field"
            autoComplete={f.autoComplete}
            minLength={f.minLength}
            required={f.name !== "name"}
          />
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="text-[14px] text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "One moment…" : submitLabel}
      </button>
    </form>
  );
}
