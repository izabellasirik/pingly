"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Clock, Sparkles } from "lucide-react";
import { completeReminderAction, rescheduleReminderAction } from "@/app/actions/reminders";
import { SNOOZE_OPTIONS } from "@/lib/reminders/logic";

export type ReminderCardData = {
  id: string;
  emoji: string;
  headline: string;
  context: string | null;
  when: string;
  overdue: boolean;
  recurring: boolean;
  person: { id: string; name: string } | null;
  action: { label: string; href: string } | null;
};

export function ReminderCard({ data, compact = false }: { data: ReminderCardData; compact?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string } | undefined>) => {
    setError(null);
    setHidden(true); // optimistic
    start(async () => {
      const res = await fn();
      // The refreshed list arrives with the action result; show whatever it says.
      setHidden(false);
      if (res?.error) setError(res.error);
    });
  };

  if (hidden && !error) return null;

  return (
    <article
      className={`card animate-in relative ${compact ? "p-4" : "p-5"} ${pending ? "opacity-60" : ""}`}
      aria-label={data.headline}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl leading-none" aria-hidden>
          {data.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-snug">{data.headline}</h3>
          {data.context && <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{data.context}</p>}
          <p className={`mt-1.5 text-[13px] font-medium ${data.overdue ? "text-accent" : "text-muted"}`}>
            {data.when}
            {data.recurring && " · every year"}
            {data.person && !compact && (
              <>
                {" · "}
                <Link href={`/people/${data.person.id}`} className="underline-offset-2 hover:underline">
                  {data.person.name}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {data.action && (
          <Link href={data.action.href} className="btn-accent btn-sm">
            <Sparkles className="size-4" aria-hidden />
            {data.action.label}
          </Link>
        )}
        <button
          type="button"
          className="btn-soft btn-sm"
          onClick={() => run(() => completeReminderAction(data.id))}
          disabled={pending}
        >
          <Check className="size-4" aria-hidden />
          Done
        </button>
        <SnoozeMenu
          open={menu}
          setOpen={setMenu}
          onPick={(when) => run(() => rescheduleReminderAction(data.id, when))}
          disabled={pending}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </article>
  );
}

function SnoozeMenu({
  open,
  setOpen,
  onPick,
  disabled,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (when: { preset: string } | { date: string; time: string }) => void;
  disabled: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, setOpen]);

  const pick = (when: { preset: string } | { date: string; time: string }) => {
    setOpen(false);
    onPick(when);
  };

  return (
    <>
      <button
        type="button"
        className="btn-ghost btn-sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setCustom(false);
          setOpen(true);
        }}
        disabled={disabled}
      >
        <Clock className="size-4" aria-hidden />
        Later
      </button>
      {open && (
        // A bottom sheet on phones (above the tab bar), a small dialog on larger screens.
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Remind me later"
            className="animate-in w-full max-w-sm rounded-t-3xl bg-surface p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl sm:pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 pb-1 pt-2 text-[13px] font-semibold text-muted">Remind me…</p>
            {!custom ? (
              <div role="menu">
                {SNOOZE_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    role="menuitem"
                    type="button"
                    className="block w-full rounded-2xl px-3 py-3 text-left text-[16px] hover:bg-surface-2"
                    onClick={() => pick({ preset: o.key })}
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  role="menuitem"
                  type="button"
                  className="block w-full rounded-2xl px-3 py-3 text-left text-[16px] hover:bg-surface-2"
                  onClick={() => setCustom(true)}
                >
                  Pick a date…
                </button>
              </div>
            ) : (
              <form
                className="space-y-2 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (date) pick({ date, time });
                }}
              >
                <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
                <input type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} required aria-label="Time" />
                <button type="submit" className="btn-primary w-full">
                  Reschedule
                </button>
              </form>
            )}
            <button type="button" className="btn-ghost mt-1 w-full" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
