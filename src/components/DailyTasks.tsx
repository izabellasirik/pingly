"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { DailyTask, Priority } from "@/lib/types";

function todayParam(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DailyTasks() {
  const [date] = useState(todayParam);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch(`/api/daily-tasks?date=${date}`);
    setTasks(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function addTask(priority: Priority, title: string) {
    if (!title.trim()) return;
    await fetch("/api/daily-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, priority, date }),
    });
    load();
  }

  async function toggleDone(task: DailyTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await fetch(`/api/daily-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
  }

  async function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/daily-tasks/${id}`, { method: "DELETE" });
  }

  const high = tasks.filter((t) => t.priority === "HIGH");
  const low = tasks.filter((t) => t.priority === "LOW");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TaskColumn
        title="Most important"
        accent="border-t-red-500"
        tasks={high}
        loading={loading}
        onAdd={(title) => addTask("HIGH", title)}
        onToggle={toggleDone}
        onRemove={removeTask}
      />
      <TaskColumn
        title="Least important"
        accent="border-t-slate-400"
        tasks={low}
        loading={loading}
        onAdd={(title) => addTask("LOW", title)}
        onToggle={toggleDone}
        onRemove={removeTask}
      />
    </div>
  );
}

function TaskColumn({
  title,
  accent,
  tasks,
  loading,
  onAdd,
  onToggle,
  onRemove,
}: {
  title: string;
  accent: string;
  tasks: DailyTask[];
  loading: boolean;
  onAdd: (title: string) => void;
  onToggle: (task: DailyTask) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onAdd(value);
    setValue("");
  }

  return (
    <div className={`bg-white rounded-lg border border-slate-200 border-t-4 ${accent} p-4`}>
      <h3 className="font-semibold text-slate-900 mb-3">{title}</h3>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing here yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => onToggle(task)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={`flex-1 text-sm ${task.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                {task.title}
              </span>
              <button
                onClick={() => onRemove(task.id)}
                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-sm"
                aria-label="Delete task"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
