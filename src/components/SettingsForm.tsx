"use client";

import { useActionState, useId } from "react";
import { deleteAccountAction, updateSettingsAction } from "@/app/actions/account";

export function SettingsForm({ displayName, emailReminders }: { displayName: string; emailReminders: boolean }) {
  const [state, action, pending] = useActionState(updateSettingsAction, undefined);
  const uid = useId();
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor={`${uid}-name`}>
          Your name
        </label>
        <input id={`${uid}-name`} name="display_name" className="field" defaultValue={displayName} maxLength={80} />
      </div>
      <label className="flex items-center justify-between gap-3 text-[15px]">
        <span>
          Email me reminders
          <span className="block text-[13px] text-muted">Sent when a reminder is due.</span>
        </span>
        <input type="checkbox" name="email_reminders" defaultChecked={emailReminders} className="size-5 accent-[var(--accent)]" />
      </label>
      {state?.error && <p className="text-[14px] text-danger">{state.error}</p>}
      {state?.ok && <p className="text-[14px] text-success">Saved</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, undefined);
  const uid = useId();
  return (
    <form action={action} className="space-y-3">
      <p className="text-[15px] text-ink-2">
        Permanently deletes your account and everything in it — people, memories and reminders. This can’t be undone.
      </p>
      <label className="label" htmlFor={`${uid}-confirm`}>
        Type DELETE to confirm
      </label>
      <input id={`${uid}-confirm`} name="confirm" className="field" autoComplete="off" />
      {state?.error && <p className="text-[14px] text-danger">{state.error}</p>}
      <button type="submit" className="btn bg-danger text-white" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}
