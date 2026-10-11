import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { getProfile, isUuid } from "@/lib/data";
import { isAIConfigured } from "@/lib/env";
import { callModel, ModelError } from "./model";
import { buildUserMessage, historyMessages, type PersonContext } from "./prompt";
import { buildProposals, type KnownPerson } from "./proposals";
import { matchPeople } from "./retrieve";
import type { AskResult, ChatTurn } from "./types";

const MAX_PEOPLE_IN_CONTEXT = 8;
const MEMORIES_PER_PERSON = 40;

export type AskInput = { message: string; history: ChatTurn[]; contextPersonIds: string[] };

// Simple per-instance limiter to protect the AI budget from runaway clients.
const recent = new Map<string, number[]>();
function rateLimited(userId: string, now: number): boolean {
  const windowMs = 5 * 60_000;
  const list = (recent.get(userId) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  recent.set(userId, list);
  return list.length > 40;
}

export async function ask(user: CurrentUser, input: AskInput, now = new Date()): Promise<AskResult> {
  const message = input.message.trim();
  if (!message) return { ok: false, error: "Type something first." };
  if (message.length > 2000) return { ok: false, error: "That's a bit long — try under 2,000 characters." };
  if (!isAIConfigured()) {
    return {
      ok: false,
      notConfigured: true,
      error: "AI isn't set up on this server yet. You can still add people, memories and reminders by hand.",
    };
  }
  if (rateLimited(user.id, now.getTime())) {
    return { ok: false, error: "You're going fast! Give it a minute and try again." };
  }

  const [profile, peopleRes] = await Promise.all([
    getProfile(user),
    user.supabase.from("people").select("id, name, relationship").eq("user_id", user.id),
  ]);
  if (peopleRes.error) return { ok: false, error: "Couldn't load your people. Please try again." };
  const allPeople = peopleRes.data;
  const owned = new Set(allPeople.map((p) => p.id));

  // Who is this about? Names in the message (and the user's last message, for
  // follow-ups like "what about her birthday?"), plus people from the previous answer.
  const lastUserTurns = input.history.filter((t) => t.role === "user").slice(-2).map((t) => t.text);
  const matched = matchPeople([message, ...lastUserTurns].join("\n"), allPeople);
  const fromContext = input.contextPersonIds.filter((id) => isUuid(id) && owned.has(id));
  const candidateIds = [...new Set([...matched, ...fromContext])].slice(0, MAX_PEOPLE_IN_CONTEXT);

  const details = await loadDetails(user, candidateIds);
  if (!details) return { ok: false, error: "Couldn't load your people. Please try again." };

  const upcomingRes = await user.supabase
    .from("reminders")
    .select("title, remind_at, person:people(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .lte("remind_at", new Date(now.getTime() + 30 * 86_400_000).toISOString())
    .order("remind_at")
    .limit(25);
  const upcoming = (upcomingRes.data ?? []).map((r) => ({
    title: r.title,
    remind_at: r.remind_at,
    personName: (r.person as { name: string } | null)?.name ?? null,
  }));

  let output;
  try {
    output = await callModel([
      ...historyMessages(input.history),
      {
        role: "user",
        content: buildUserMessage({
          message,
          now,
          timeZone: profile.timezone,
          people: details.context,
          upcoming,
        }),
      },
    ]);
  } catch (error) {
    if (error instanceof ModelError) {
      console.error("[pingly] AI call failed:", error.message);
      return { ok: false, error: error.userMessage };
    }
    throw error;
  }

  const built = buildProposals(output, {
    candidates: details.known,
    allPeople,
    now,
    timeZone: profile.timezone,
  });

  let reply = output.reply.trim() || "Okay.";
  if (built.dropped > 0) {
    reply += " (I couldn't prepare part of that — try rephrasing if something's missing.)";
  }

  return {
    ok: true,
    reply,
    proposals: built.proposals,
    draft: built.draft,
    choices: built.choices,
    contextPersonIds: built.personIds.length ? built.personIds : candidateIds,
  };
}

async function loadDetails(user: CurrentUser, ids: string[]) {
  const known = new Map<string, KnownPerson>();
  const context: PersonContext[] = [];
  if (ids.length === 0) return { known, context };

  const [peopleRes, memoriesRes, remindersRes] = await Promise.all([
    user.supabase.from("people").select("*").eq("user_id", user.id).in("id", ids),
    user.supabase
      .from("memories")
      .select("person_id, content, created_at")
      .eq("user_id", user.id)
      .in("person_id", ids)
      .order("created_at", { ascending: false })
      .limit(ids.length * MEMORIES_PER_PERSON),
    user.supabase
      .from("reminders")
      .select("person_id, title, remind_at, recurrence, status, kind, completed_at")
      .eq("user_id", user.id)
      .in("person_id", ids)
      .order("remind_at", { ascending: false })
      .limit(ids.length * 15),
  ]);
  if (peopleRes.error || memoriesRes.error || remindersRes.error) return null;

  for (const id of ids) {
    const p = peopleRes.data.find((x) => x.id === id);
    if (!p) continue;
    const memories = memoriesRes.data
      .filter((m) => m.person_id === id)
      .slice(0, MEMORIES_PER_PERSON)
      .map((m) => m.content);
    const reminders = remindersRes.data.filter((r) => r.person_id === id);
    known.set(id, {
      ...p,
      memories,
      hasBirthdayReminder: reminders.some((r) => r.kind === "birthday" && r.status === "active"),
    });
    // Note: email and phone are deliberately not sent to the model.
    context.push({
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      birthday_month: p.birthday_month,
      birthday_day: p.birthday_day,
      birthday_year: p.birthday_year,
      memories,
      reminders: [
        ...reminders.filter((r) => r.status === "active").slice(0, 5),
        ...reminders.filter((r) => r.status === "done").slice(0, 3),
      ],
    });
  }
  return { known, context };
}
