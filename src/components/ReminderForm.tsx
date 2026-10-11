"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { createReminderAction } from "@/app/actions/reminders";

export function ReminderForm({
  personId,
  defaultTitle,
  defaultDate,
  onDone,
}: {
  personId: string | null;
  defaultTitle: string;
  defaultDate: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(createReminderAction, undefined);
  const done = useRef(onDone);
  const uid = useId();
  useEffect(() => {
    if (state?.ok) done.current?.();
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      {personId && <input type="hidden" name="personId" value={personId} />}
      <div>
        <label className="label" htmlFor={`${uid}-r-title`}>
          Remind me to…
        </label>
        <input id={`${uid}-r-title`} name="title" className="field" defaultValue={defaultTitle} required maxLength={160} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`${uid}-r-date`}>
            Date
          </label>
          <input id={`${uid}-r-date`} name="date" type="date" className="field" defaultValue={defaultDate} required />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-r-time`}>
            Time
          </label>
          <input id={`${uid}-r-time`} name="time" type="time" className="field" defaultValue="09:00" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`${uid}-r-kind`}>
            Type
          </label>
          <select id={`${uid}-r-kind`} name="kind" className="field" defaultValue="check_in">
            <option value="check_in">👋 Check in</option>
            <option value="follow_up">💬 Follow up</option>
            <option value="custom">🔔 Other</option>
          </select>
        </div>
        <label className="mt-6 flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="recurrence" value="yearly" className="size-4 accent-[var(--accent)]" />
          Every year
        </label>
      </div>
      <div>
        <label className="label" htmlFor={`${uid}-r-note`}>
          Note (optional)
        </label>
        <input id={`${uid}-r-note`} name="note" className="field" maxLength={500} placeholder="Ask about the new project" />
      </div>
      {state?.error && (
        <p role="alert" className="text-[14px] text-danger">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save reminder"}
      </button>
    </form>
  );
}
