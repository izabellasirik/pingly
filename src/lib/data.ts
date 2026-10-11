import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import type { CurrentUser } from "@/lib/auth";
import { safeTimeZone } from "@/lib/dates";

export type Person = Database["public"]["Tables"]["people"]["Row"];
export type Memory = Database["public"]["Tables"]["memories"]["Row"];
export type Reminder = Database["public"]["Tables"]["reminders"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type ReminderWithPerson = Reminder & {
  person: Pick<Person, "id" | "name" | "relationship" | "birthday_month" | "birthday_day"> | null;
};

const REMINDER_WITH_PERSON =
  "*, person:people(id, name, relationship, birthday_month, birthday_day)" as const;

// All queries below run with the user's own session, so Row Level Security
// limits them to that user's rows. The explicit user_id filters are a second,
// redundant guard and help Postgres use the right index.

export async function getProfile(user: CurrentUser): Promise<Profile & { timezone: string }> {
  const { data, error } = await user.supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  return { ...data, timezone: safeTimeZone(data.timezone) };
}

export async function listPeople(user: CurrentUser) {
  const { data, error } = await user.supabase
    .from("people")
    .select("id, name, relationship, birthday_month, birthday_day")
    .eq("user_id", user.id)
    .order("name");
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return data;
}

export async function getPerson(user: CurrentUser, id: string) {
  if (!isUuid(id)) return null;
  const { data, error } = await user.supabase
    .from("people")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load this person: ${error.message}`);
  return data;
}

export async function listMemories(user: CurrentUser, personId: string) {
  const { data, error } = await user.supabase
    .from("memories")
    .select("*")
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load memories: ${error.message}`);
  return data;
}

export async function listActiveReminders(user: CurrentUser): Promise<ReminderWithPerson[]> {
  const { data, error } = await user.supabase
    .from("reminders")
    .select(REMINDER_WITH_PERSON)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("remind_at")
    .limit(500);
  if (error) throw new Error(`Could not load reminders: ${error.message}`);
  return data as ReminderWithPerson[];
}

export async function listPersonReminders(user: CurrentUser, personId: string) {
  const { data, error } = await user.supabase
    .from("reminders")
    .select("*")
    .eq("user_id", user.id)
    .eq("person_id", personId)
    .order("remind_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`Could not load reminders: ${error.message}`);
  const active = data.filter((r) => r.status === "active");
  const history = data
    .filter((r) => r.status === "done")
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return { active, history };
}

/** Latest memories for a set of people (for Today card context). */
export async function latestMemoriesFor(user: CurrentUser, personIds: string[], perPerson = 2) {
  const result = new Map<string, string[]>();
  if (personIds.length === 0) return result;
  const { data, error } = await user.supabase
    .from("memories")
    .select("person_id, content, created_at")
    .eq("user_id", user.id)
    .in("person_id", personIds)
    .order("created_at", { ascending: false })
    .limit(personIds.length * 10);
  if (error) return result;
  for (const m of data) {
    const list = result.get(m.person_id) ?? [];
    if (list.length < perPerson) list.push(m.content);
    result.set(m.person_id, list);
  }
  return result;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
