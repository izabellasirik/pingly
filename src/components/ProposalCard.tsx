"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { Proposal } from "@/lib/ai/types";
import { formatDate, formatMonthDay, formatTime } from "@/lib/dates";
import { KIND_EMOJI } from "@/lib/reminders/logic";

export type CardStatus = "idle" | "saving" | "saved" | "dismissed" | "error";
export type CardState = {
  proposal: Proposal;
  status: CardStatus;
  error?: string;
  savedPersonId?: string | null;
};

export function ProposalCard({
  card,
  blockedBy,
  onSave,
  onDismiss,
  onChange,
  onUseExisting,
}: {
  card: CardState;
  /** Name of a new person that must be saved before this card can be. */
  blockedBy: string | null;
  onSave: () => void;
  onDismiss: () => void;
  onChange: (p: Proposal) => void;
  onUseExisting: (person: { id: string; name: string }) => void;
}) {
  const p = card.proposal;
  const [editing, setEditing] = useState(false);
  const done = card.status === "saved";
  const busy = card.status === "saving";

  if (card.status === "dismissed") {
    return <p className="px-1 text-[13px] text-muted line-through">{summary(p)}</p>;
  }

  const removeMemory = (i: number) => {
    if (p.kind === "create_person" || p.kind === "add_memories") {
      onChange({ ...p, memories: p.memories.filter((_, j) => j !== i) });
    }
  };

  return (
    <div
      className={`animate-in rounded-2xl border p-4 ${done ? "border-success/40 bg-success/5" : "border-line bg-surface"}`}
      data-testid="proposal"
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label(p)}</p>

      {p.kind === "create_person" && (
        <div className="mt-1 space-y-1 text-[15px]">
          <p className="text-[17px] font-semibold">{p.name}</p>
          {p.relationship && <p className="text-ink-2">{p.relationship}</p>}
          {p.birthday && <p className="text-ink-2">🎂 {formatMonthDay(p.birthday.month, p.birthday.day, p.birthday.year)}</p>}
          {p.email && <p className="text-ink-2">{p.email}</p>}
          {p.phone && <p className="text-ink-2">{p.phone}</p>}
          <MemoryList memories={p.memories} onRemove={done ? undefined : removeMemory} />
          {p.similar.length > 0 && !done && (
            <div className="mt-2 rounded-xl bg-accent-soft p-3 text-[14px]">
              <p>
                You already have{" "}
                {p.similar.map((s) => `${s.name}${s.relationship ? ` (${s.relationship})` : ""}`).join(", ")}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.similar.map((s) => (
                  <button key={s.id} type="button" className="btn-soft btn-sm" onClick={() => onUseExisting(s)}>
                    Add to {s.name} instead
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {p.kind === "add_memories" && <MemoryList memories={p.memories} onRemove={done ? undefined : removeMemory} />}

      {p.kind === "update_person" && (
        <ul className="mt-1 space-y-1 text-[15px]">
          {p.changes.map((c) => (
            <li key={c.field}>
              <span className="text-muted">{c.field[0].toUpperCase() + c.field.slice(1)}: </span>
              {c.fromLabel ? (
                <>
                  <span className="text-muted line-through">{c.fromLabel}</span> → <strong>{c.toLabel}</strong>
                  {!done && <span className="ml-1 text-[12px] text-accent">(replaces saved value)</span>}
                </>
              ) : (
                <strong>{c.toLabel}</strong>
              )}
            </li>
          ))}
        </ul>
      )}

      {p.kind === "create_reminder" &&
        (editing && p.reminderKind !== "birthday" ? (
          <div className="mt-2 space-y-2">
            <input
              className="field !py-2"
              value={p.title}
              maxLength={160}
              onChange={(e) => onChange({ ...p, title: e.target.value })}
              aria-label="Reminder title"
            />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="field !py-2" value={p.date} onChange={(e) => onChange({ ...p, date: e.target.value })} aria-label="Date" />
              <input type="time" className="field !py-2" value={p.time} onChange={(e) => onChange({ ...p, time: e.target.value })} aria-label="Time" />
            </div>
          </div>
        ) : (
          <div className="mt-1 text-[15px]">
            <p className="text-[17px] font-semibold">
              {KIND_EMOJI[p.reminderKind]} {p.title}
            </p>
            <p className="text-ink-2">
              {p.reminderKind === "birthday"
                ? "Every year, the morning before their birthday"
                : `${formatDate(p.date)} · ${formatTime(p.time)}${p.recurrence === "yearly" ? " · every year" : ""}`}
            </p>
            {p.note && <p className="text-muted">{p.note}</p>}
          </div>
        ))}

      {card.error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {card.error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done ? (
          <>
            <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-success">
              <Check className="size-4" aria-hidden /> Saved
            </span>
            {card.savedPersonId && (
              <Link href={`/people/${card.savedPersonId}`} className="text-[14px] text-muted underline-offset-2 hover:underline">
                View profile
              </Link>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn-primary btn-sm" onClick={onSave} disabled={busy || Boolean(blockedBy) || isEmpty(p)}>
              {busy ? "Saving…" : p.kind === "update_person" && p.changes.some((c) => c.fromLabel) ? "Replace" : "Save"}
            </button>
            {p.kind === "create_reminder" && p.reminderKind !== "birthday" && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(!editing)}>
                <Pencil className="size-3.5" aria-hidden />
                {editing ? "Done editing" : "Edit"}
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={onDismiss} disabled={busy}>
              Dismiss
            </button>
            {blockedBy && <span className="text-[13px] text-muted">Save {blockedBy} first</span>}
          </>
        )}
      </div>
    </div>
  );
}

function MemoryList({ memories, onRemove }: { memories: string[]; onRemove?: (i: number) => void }) {
  if (memories.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {memories.map((m, i) => (
        <li key={`${i}-${m}`} className="flex items-start gap-2 text-[15px]">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="flex-1">{m}</span>
          {onRemove && (
            <button type="button" className="text-muted hover:text-ink" aria-label={`Remove “${m}”`} onClick={() => onRemove(i)}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function isEmpty(p: Proposal) {
  return p.kind === "add_memories" && p.memories.length === 0;
}

export function label(p: Proposal): string {
  switch (p.kind) {
    case "create_person":
      return "New person";
    case "add_memories":
      return `Add to ${p.personName}`;
    case "update_person":
      return `Update ${p.personName}`;
    case "create_reminder":
      return p.personName ? `Reminder · ${p.personName}` : "Reminder";
  }
}

function summary(p: Proposal): string {
  switch (p.kind) {
    case "create_person":
      return `New person: ${p.name}`;
    case "add_memories":
      return `Add to ${p.personName}`;
    case "update_person":
      return `Update ${p.personName}`;
    case "create_reminder":
      return p.title;
  }
}
