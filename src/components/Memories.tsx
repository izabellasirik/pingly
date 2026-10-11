"use client";

import { useId, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { addMemoryAction, deleteMemoryAction, updateMemoryAction } from "@/app/actions/people";

type MemoryItem = { id: string; content: string; added: string };

export function Memories({ personId, firstName, memories }: { personId: string; firstName: string; memories: MemoryItem[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const uid = useId();

  return (
    <section aria-labelledby={`${uid}-heading`}>
      <h2 id={`${uid}-heading`} className="section-title">
        What you know
      </h2>
      <div className="card overflow-hidden">
        <form
          className="flex items-center gap-2 border-b border-line p-2 pl-4"
          onSubmit={(e) => {
            e.preventDefault();
            const value = text.trim();
            if (!value) return;
            setError(null);
            start(async () => {
              const res = await addMemoryAction(personId, value);
              if (res?.error) setError(res.error);
              else setText("");
            });
          }}
        >
          <label htmlFor={`${uid}-input`} className="sr-only">
            Add a memory about {firstName}
          </label>
          <input
            id={`${uid}-input`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Add something about ${firstName}…`}
            className="min-w-0 flex-1 bg-transparent py-2 text-[16px] outline-none placeholder:text-muted"
            maxLength={500}
            autoComplete="off"
          />
          <button type="submit" className="btn-soft !size-9 !p-0" aria-label="Save memory" disabled={pending || !text.trim()}>
            <Plus className="size-5" aria-hidden />
          </button>
        </form>
        {error && (
          <p role="alert" className="px-4 pt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        {memories.length === 0 ? (
          <p className="px-4 py-5 text-[15px] text-muted">
            Nothing saved yet. Interests, family, what you talked about — anything that helps you remember.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {memories.map((m) => (
              <MemoryRow key={m.id} memory={m} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MemoryRow({ memory }: { memory: MemoryItem }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memory.content);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  if (editing) {
    return (
      <li className="p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await updateMemoryAction(memory.id, value);
              if (res?.error) setError(res.error);
              else setEditing(false);
            });
          }}
        >
          <input value={value} onChange={(e) => setValue(e.target.value)} className="field !py-2" maxLength={500} autoFocus aria-label="Edit memory" />
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            Save
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
        {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
      </li>
    );
  }

  return (
    <li className={`group flex items-start gap-3 px-4 py-3 ${pending ? "opacity-50" : ""}`}>
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] leading-relaxed">{memory.content}</p>
        <p className="text-[12px] text-muted">{memory.added}</p>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <button type="button" className="btn-ghost !p-2" aria-label={`Edit “${memory.content}”`} onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="btn-ghost !p-2 hover:!text-danger"
          aria-label={`Delete “${memory.content}”`}
          onClick={() =>
            start(async () => {
              setGone(true);
              const res = await deleteMemoryAction(memory.id);
              if (res?.error) {
                setGone(false);
                setError(res.error);
              }
            })
          }
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
