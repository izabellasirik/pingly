"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import type { WeeklyTask } from "@/lib/types";
import { formatWeekLabel, getWeekStart, shiftWeek, toDateParam } from "@/lib/week";

export default function WeeklyPlanPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
      <WeeklyPlanContent />
    </Suspense>
  );
}

function WeeklyPlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weekStart = useMemo(() => {
    const param = searchParams.get("week");
    const base = param ? new Date(`${param}T00:00:00`) : new Date();
    return getWeekStart(Number.isNaN(base.getTime()) ? new Date() : base);
  }, [searchParams]);

  const [tasks, setTasks] = useState<WeeklyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/weekly-tasks?weekStart=${toDateParam(weekStart)}`);
    setTasks(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.getTime()]);

  function goToWeek(date: Date) {
    router.push(`/weekly?week=${toDateParam(date)}`);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    await fetch("/api/weekly-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value, weekStart: toDateParam(weekStart) }),
    });
    setValue("");
    load();
  }

  async function toggleDone(task: WeeklyTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await fetch(`/api/weekly-tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !task.done }),
    });
  }

  async function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/weekly-tasks/${id}`, { method: "DELETE" });
  }

  const isCurrentWeek = toDateParam(weekStart) === toDateParam(getWeekStart(new Date()));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Weekly plan</h1>
      </div>

      <div className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-4 py-3">
        <button
          onClick={() => goToWeek(shiftWeek(weekStart, -1))}
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          ← Previous week
        </button>
        <div className="text-center">
          <p className="font-medium text-slate-900">{formatWeekLabel(weekStart)}</p>
          {isCurrentWeek && <p className="text-xs text-indigo-600">This week</p>}
        </div>
        <button
          onClick={() => goToWeek(shiftWeek(weekStart, 1))}
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          Next week →
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a task for this week…"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
          >
            Add
          </button>
        </form>

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-400">No tasks for this week yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 group">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleDone(task)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className={`flex-1 text-sm ${task.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                  {task.title}
                </span>
                <button
                  onClick={() => removeTask(task.id)}
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
    </div>
  );
}
