"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  completeReminder,
  createReminder,
  deleteReminder,
  ensureBirthdayReminder,
  rescheduleReminder,
} from "@/lib/mutations";
import { dateString, firstError, reminderInputSchema, timeString } from "@/lib/validation";
import type { FormState } from "./types";

export async function createReminderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = reminderInputSchema.safeParse({
    personId: form.get("personId") || null,
    title: form.get("title") ?? "",
    note: form.get("note"),
    kind: form.get("kind") || "custom",
    date: form.get("date") ?? "",
    time: form.get("time") || "09:00",
    recurrence: form.get("recurrence") === "yearly" ? "yearly" : "none",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const result = await createReminder(user, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true, message: "Reminder saved" };
}

export async function completeReminderAction(reminderId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await completeReminder(user, reminderId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

const when = z.union([
  z.object({ preset: z.enum(["later", "tomorrow", "weekend", "next_week"]) }),
  z.object({ date: dateString, time: timeString }),
]);

export async function rescheduleReminderAction(reminderId: string, input: unknown): Promise<FormState> {
  const user = await requireUser();
  const parsed = when.safeParse(input);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const result = await rescheduleReminder(user, reminderId, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function deleteReminderAction(reminderId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteReminder(user, reminderId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function addBirthdayReminderAction(personId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await ensureBirthdayReminder(user, personId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}
