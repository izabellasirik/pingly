import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { birthdayReminderAt, zonedToUtc } from "@/lib/dates";
import { getProfile, isUuid, type Person, type Reminder } from "@/lib/data";
import { nextOccurrenceAfterDone, snoozeUntil, type SnoozeOption } from "@/lib/reminders/logic";
import type { PersonFields, ReminderInput } from "@/lib/validation";

/** Result type for every write. Errors are user-facing sentences. */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

const UNIQUE_VIOLATION = "23505";

function dbError(action: string, error: { code?: string; message: string }): Result<never> {
  console.error(`[pingly] ${action} failed:`, error.code, error.message);
  return fail(`Couldn't ${action}. Please try again.`);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export async function createPerson(
  user: CurrentUser,
  fields: PersonFields,
  options: { memories?: string[]; birthdayReminder?: boolean } = {},
): Promise<Result<Person>> {
  const { data: person, error } = await user.supabase
    .from("people")
    .insert({
      user_id: user.id,
      name: fields.name,
      relationship: fields.relationship,
      birthday_month: fields.birthday?.month ?? null,
      birthday_day: fields.birthday?.day ?? null,
      birthday_year: fields.birthday?.year ?? null,
      email: fields.email,
      phone: fields.phone,
    })
    .select()
    .single();
  if (error) return dbError("save this person", error);

  if (options.memories?.length) {
    const added = await addMemories(user, person.id, options.memories);
    if (!added.ok) return added;
  }
  if (options.birthdayReminder && fields.birthday) {
    const r = await ensureBirthdayReminder(user, person.id);
    if (!r.ok) return r;
  }
  return ok(person);
}

type PersonChanges = Partial<Omit<PersonFields, "name">> & { name?: string };

/**
 * Updates a person. When `expected` is given (AI proposals), each changed field
 * must still hold the value the user saw when confirming, so we never
 * overwrite something that changed in the meantime.
 */
export async function updatePerson(
  user: CurrentUser,
  personId: string,
  changes: PersonChanges,
  expected?: Partial<Record<keyof PersonChanges, unknown>>,
): Promise<Result<Person>> {
  if (!isUuid(personId)) return fail("That person doesn't exist.");
  const { data: current, error: loadError } = await user.supabase
    .from("people")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", personId)
    .maybeSingle();
  if (loadError) return dbError("load this person", loadError);
  if (!current) return fail("That person doesn't exist anymore.");

  if (expected) {
    for (const [field, value] of Object.entries(expected)) {
      const now = currentValue(current, field as keyof PersonChanges);
      if (JSON.stringify(now ?? null) !== JSON.stringify(value ?? null)) {
        return fail(`${current.name}'s ${field} changed since this was suggested. Nothing was overwritten.`);
      }
    }
  }

  const patch: Partial<Person> = {};
  if (changes.name !== undefined) patch.name = changes.name;
  if (changes.relationship !== undefined) patch.relationship = changes.relationship;
  if (changes.email !== undefined) patch.email = changes.email;
  if (changes.phone !== undefined) patch.phone = changes.phone;
  if (changes.birthday !== undefined) {
    patch.birthday_month = changes.birthday?.month ?? null;
    patch.birthday_day = changes.birthday?.day ?? null;
    patch.birthday_year = changes.birthday?.year ?? null;
  }

  const { data: person, error } = await user.supabase
    .from("people")
    .update(patch)
    .eq("user_id", user.id)
    .eq("id", personId)
    .select()
    .single();
  if (error) return dbError("update this person", error);

  // Keep an existing yearly birthday reminder in sync with the birthday.
  if (changes.birthday !== undefined) {
    const synced = await syncBirthdayReminder(user, person);
    if (!synced.ok) return synced;
  }
  return ok(person);
}

export function currentValue(person: Person, field: keyof PersonChanges): unknown {
  if (field === "birthday") {
    return person.birthday_month && person.birthday_day
      ? { month: person.birthday_month, day: person.birthday_day, year: person.birthday_year ?? null }
      : null;
  }
  return person[field] ?? null;
}

export async function deletePerson(user: CurrentUser, personId: string): Promise<Result> {
  if (!isUuid(personId)) return fail("That person doesn't exist.");
  // Memories and reminders cascade in the database.
  const { error, count } = await user.supabase
    .from("people")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .eq("id", personId);
  if (error) return dbError("delete this person", error);
  if (!count) return fail("That person doesn't exist anymore.");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

/** Adds memories, skipping ones that are already saved (case-insensitive). */
export async function addMemories(
  user: CurrentUser,
  personId: string,
  contents: string[],
): Promise<Result<{ added: number }>> {
  if (!isUuid(personId)) return fail("That person doesn't exist.");
  const { data: existing, error: loadError } = await user.supabase
    .from("memories")
    .select("content")
    .eq("user_id", user.id)
    .eq("person_id", personId);
  if (loadError) return dbError("save this memory", loadError);

  const seen = new Set(existing.map((m) => normalize(m.content)));
  const rows = [];
  for (const raw of contents) {
    const content = raw.trim();
    const key = normalize(content);
    if (!content || seen.has(key)) continue;
    seen.add(key);
    rows.push({ user_id: user.id, person_id: personId, content });
  }
  if (rows.length === 0) return ok({ added: 0 });

  const { error } = await user.supabase.from("memories").insert(rows);
  // A foreign-key failure here means the person isn't this user's.
  if (error?.code === "23503") return fail("That person doesn't exist anymore.");
  if (error) return dbError("save this memory", error);
  return ok({ added: rows.length });
}

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ");
}

export async function updateMemory(user: CurrentUser, memoryId: string, content: string): Promise<Result> {
  if (!isUuid(memoryId)) return fail("That memory doesn't exist.");
  const { error, count } = await user.supabase
    .from("memories")
    .update({ content }, { count: "exact" })
    .eq("user_id", user.id)
    .eq("id", memoryId);
  if (error) return dbError("update this memory", error);
  if (!count) return fail("That memory doesn't exist anymore.");
  return ok(undefined);
}

export async function deleteMemory(user: CurrentUser, memoryId: string): Promise<Result> {
  if (!isUuid(memoryId)) return fail("That memory doesn't exist.");
  const { error } = await user.supabase
    .from("memories")
    .delete()
    .eq("user_id", user.id)
    .eq("id", memoryId);
  if (error) return dbError("delete this memory", error);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export async function createReminder(
  user: CurrentUser,
  input: ReminderInput,
  now = new Date(),
): Promise<Result<Reminder>> {
  if (input.kind === "birthday") {
    if (!input.personId) return fail("A birthday reminder needs a person.");
    return ensureBirthdayReminder(user, input.personId, now);
  }
  const { timezone } = await getProfile(user);
  const remindAt = zonedToUtc(input.date, input.time, timezone);
  if (!remindAt) return fail("Pick a valid date and time.");
  if (remindAt.getTime() < now.getTime() - 60_000) {
    return fail("That time has already passed. Pick a time in the future.");
  }

  const { data, error } = await user.supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      person_id: input.personId,
      title: input.title,
      note: input.note,
      kind: input.kind,
      remind_at: remindAt.toISOString(),
      recurrence: input.recurrence,
    })
    .select()
    .single();
  if (error?.code === UNIQUE_VIOLATION) return fail("You already have this reminder.");
  if (error?.code === "23503") return fail("That person doesn't exist anymore.");
  if (error) return dbError("save this reminder", error);
  return ok(data);
}

/** Creates the yearly birthday reminder for a person, unless one exists. */
export async function ensureBirthdayReminder(
  user: CurrentUser,
  personId: string,
  now = new Date(),
): Promise<Result<Reminder>> {
  const { data: person, error: loadError } = await user.supabase
    .from("people")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", personId)
    .maybeSingle();
  if (loadError) return dbError("load this person", loadError);
  if (!person) return fail("That person doesn't exist anymore.");
  if (!person.birthday_month || !person.birthday_day) {
    return fail(`Add ${person.name}'s birthday first.`);
  }

  const { data: existing } = await user.supabase
    .from("reminders")
    .select("*")
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .eq("kind", "birthday")
    .eq("status", "active")
    .maybeSingle();
  if (existing) return ok(existing);

  const { timezone } = await getProfile(user);
  const remindAt = birthdayReminderAt(person.birthday_month, person.birthday_day, now, timezone);
  const { data, error } = await user.supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      person_id: personId,
      title: `${person.name}'s birthday`,
      kind: "birthday",
      recurrence: "yearly",
      remind_at: remindAt.toISOString(),
    })
    .select()
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    // Created concurrently — return the one that won.
    const { data: winner } = await user.supabase
      .from("reminders")
      .select("*")
      .eq("person_id", personId)
      .eq("kind", "birthday")
      .eq("status", "active")
      .single();
    if (winner) return ok(winner);
  }
  if (error) return dbError("save the birthday reminder", error);
  return ok(data);
}

async function syncBirthdayReminder(user: CurrentUser, person: Person): Promise<Result> {
  const { data: reminder, error } = await user.supabase
    .from("reminders")
    .select("id")
    .eq("user_id", user.id)
    .eq("person_id", person.id)
    .eq("kind", "birthday")
    .eq("status", "active")
    .maybeSingle();
  if (error) return dbError("update the birthday reminder", error);
  if (!reminder) return ok(undefined);

  if (!person.birthday_month || !person.birthday_day) {
    const { error: delError } = await user.supabase.from("reminders").delete().eq("id", reminder.id);
    return delError ? dbError("remove the birthday reminder", delError) : ok(undefined);
  }
  const { timezone } = await getProfile(user);
  const remindAt = birthdayReminderAt(person.birthday_month, person.birthday_day, new Date(), timezone);
  const { error: upError } = await user.supabase
    .from("reminders")
    .update({ remind_at: remindAt.toISOString(), title: `${person.name}'s birthday` })
    .eq("id", reminder.id);
  return upError ? dbError("update the birthday reminder", upError) : ok(undefined);
}

async function loadActiveReminder(user: CurrentUser, reminderId: string) {
  if (!isUuid(reminderId)) return null;
  const { data } = await user.supabase
    .from("reminders")
    .select("*, person:people(birthday_month, birthday_day)")
    .eq("user_id", user.id)
    .eq("id", reminderId)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

/**
 * Marks a reminder done. One-time reminders move to history; yearly ones log
 * a completed entry and roll forward to their next occurrence. Conditional
 * updates make double-clicks and concurrent devices harmless.
 */
export async function completeReminder(
  user: CurrentUser,
  reminderId: string,
  now = new Date(),
): Promise<Result<{ next: string | null }>> {
  const reminder = await loadActiveReminder(user, reminderId);
  if (!reminder) return ok({ next: null }); // Already done elsewhere.

  const completedAt = now.toISOString();
  if (reminder.recurrence !== "yearly") {
    const { error } = await user.supabase
      .from("reminders")
      .update({ status: "done", completed_at: completedAt })
      .eq("id", reminder.id)
      .eq("status", "active");
    return error ? dbError("complete this reminder", error) : ok({ next: null });
  }

  const { timezone } = await getProfile(user);
  const next = nextOccurrenceAfterDone(reminder, reminder.person, now, timezone)!;
  const { data: advanced, error } = await user.supabase
    .from("reminders")
    .update({ remind_at: next.toISOString() })
    .eq("id", reminder.id)
    .eq("status", "active")
    .eq("remind_at", reminder.remind_at)
    .select("id");
  if (error) return dbError("complete this reminder", error);
  if (advanced.length === 0) return ok({ next: null }); // Someone else completed it first.

  // History entry for this occurrence.
  const { error: logError } = await user.supabase.from("reminders").insert({
    user_id: user.id,
    person_id: reminder.person_id,
    title: reminder.title,
    note: reminder.note,
    kind: reminder.kind,
    recurrence: "none",
    remind_at: reminder.remind_at,
    status: "done",
    completed_at: completedAt,
  });
  if (logError) console.error("[pingly] could not log reminder history:", logError.message);
  return ok({ next: next.toISOString() });
}

export async function rescheduleReminder(
  user: CurrentUser,
  reminderId: string,
  when: { preset: SnoozeOption["key"] } | { date: string; time: string },
  now = new Date(),
): Promise<Result<{ remindAt: string }>> {
  const reminder = await loadActiveReminder(user, reminderId);
  if (!reminder) return fail("That reminder is already done.");
  const { timezone } = await getProfile(user);
  const at = "preset" in when ? snoozeUntil(when.preset, now, timezone) : zonedToUtc(when.date, when.time, timezone);
  if (!at) return fail("Pick a valid date and time.");
  if (at.getTime() < now.getTime() - 60_000) return fail("Pick a time in the future.");

  const { error } = await user.supabase
    .from("reminders")
    .update({ remind_at: at.toISOString() })
    .eq("id", reminder.id)
    .eq("user_id", user.id);
  if (error?.code === UNIQUE_VIOLATION) return fail("You already have this reminder at that time.");
  if (error) return dbError("reschedule this reminder", error);
  return ok({ remindAt: at.toISOString() });
}

export async function deleteReminder(user: CurrentUser, reminderId: string): Promise<Result> {
  if (!isUuid(reminderId)) return fail("That reminder doesn't exist.");
  const { error } = await user.supabase
    .from("reminders")
    .delete()
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (error) return dbError("delete this reminder", error);
  return ok(undefined);
}
