"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  addMemories,
  createPerson,
  deleteMemory,
  deletePerson,
  ensureBirthdayReminder,
  updateMemory,
  updatePerson,
} from "@/lib/mutations";
import { firstError, memorySchema, personFieldsSchema } from "@/lib/validation";
import type { FormState } from "./types";

function readPersonForm(form: FormData) {
  const month = Number(form.get("birthday_month") || 0);
  const day = Number(form.get("birthday_day") || 0);
  const yearRaw = String(form.get("birthday_year") ?? "").trim();
  const birthday =
    month || day ? { month, day, year: yearRaw ? Number(yearRaw) : null } : null;
  return personFieldsSchema.safeParse({
    name: form.get("name") ?? "",
    relationship: form.get("relationship"),
    birthday,
    email: form.get("email"),
    phone: form.get("phone"),
  });
}

export async function createPersonAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = readPersonForm(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const firstMemory = String(form.get("memory") ?? "").trim();
  const result = await createPerson(user, parsed.data, {
    memories: firstMemory ? firstMemory.split(/\n+/).map((m) => m.slice(0, 500)) : [],
    birthdayReminder: form.get("birthday_reminder") === "on",
  });
  if (!result.ok) return { error: result.error };
  redirect(`/people/${result.data.id}`);
}

export async function updatePersonAction(personId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = readPersonForm(form);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const result = await updatePerson(user, personId, parsed.data);
  if (!result.ok) return { error: result.error };
  if (form.get("birthday_reminder") === "on" && parsed.data.birthday) {
    const r = await ensureBirthdayReminder(user, personId);
    if (!r.ok) return { error: r.error };
  }
  refresh();
  return { ok: true, message: "Saved" };
}

export async function deletePersonAction(personId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await deletePerson(user, personId);
  if (!result.ok) return { error: result.error };
  redirect("/people");
}

export async function addMemoryAction(personId: string, text: string): Promise<FormState> {
  const user = await requireUser();
  const parsed = memorySchema.safeParse(text);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const result = await addMemories(user, personId, [parsed.data]);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true, message: result.data.added ? "Saved" : "Already saved" };
}

export async function updateMemoryAction(memoryId: string, text: string): Promise<FormState> {
  const user = await requireUser();
  const parsed = memorySchema.safeParse(text);
  if (!parsed.success) return { error: firstError(parsed.error) };
  const result = await updateMemory(user, memoryId, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function deleteMemoryAction(memoryId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await deleteMemory(user, memoryId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}
