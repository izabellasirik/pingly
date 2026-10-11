import { describe, expect, it } from "vitest";
import { matchPeople } from "@/lib/ai/retrieve";
import { buildProposals, type KnownPerson } from "@/lib/ai/proposals";
import { historyMessages } from "@/lib/ai/prompt";
import type { ModelOutput } from "@/lib/ai/schema";
import { zonedToUtc } from "@/lib/dates";

const people = [
  { id: "a1", name: "Anna Smith", relationship: "Friend" },
  { id: "a2", name: "Anna Lee", relationship: "Coworker" },
  { id: "m1", name: "Michael Brown", relationship: "Client" },
  { id: "mom", name: "Mom", relationship: "Mother" },
  { id: "s1", name: "Sarah Jones", relationship: "Sister" },
  { id: "w1", name: "Will Turner", relationship: null },
];

describe("matchPeople", () => {
  it("matches full and first names, case-insensitively, with possessives", () => {
    expect(matchPeople("What do I remember about michael?", people)).toEqual(["m1"]);
    expect(matchPeople("Anna Smith's birthday", people)[0]).toBe("a1");
  });

  it("returns every person sharing an ambiguous first name", () => {
    expect(matchPeople("What should I buy Anna?", people).sort()).toEqual(["a1", "a2"]);
  });

  it("matches family words to names and relationships", () => {
    expect(matchPeople("Remind me to call my mother tomorrow", people)).toEqual(["mom"]);
    expect(matchPeople("Check in with my sister", people)).toEqual(["s1"]);
  });

  it("ignores common words unless they look like a name", () => {
    expect(matchPeople("I will call later", people)).toEqual([]);
    expect(matchPeople("Will loves sailing", people)).toEqual(["w1"]);
  });

  it("matches nobody when nobody is mentioned", () => {
    expect(matchPeople("I met David today. He's a financial advisor.", people)).toEqual([]);
  });
});

const TZ = "America/New_York";
const NOW = zonedToUtc("2026-10-11", "10:00", TZ)!;

function person(over: Partial<KnownPerson> & { id: string; name: string }): KnownPerson {
  return {
    relationship: null,
    birthday_month: null,
    birthday_day: null,
    birthday_year: null,
    email: null,
    phone: null,
    memories: [],
    hasBirthdayReminder: false,
    ...over,
  };
}

const anna = person({ id: "a1", name: "Anna Smith", relationship: "Friend", birthday_month: 5, birthday_day: 10, memories: ["Loves tennis"] });
const ctx = (cands: KnownPerson[] = [anna]) => ({
  candidates: new Map(cands.map((c) => [c.id, c])),
  allPeople: people,
  now: NOW,
  timeZone: TZ,
});
const out = (actions: ModelOutput["actions"], extra: Partial<ModelOutput> = {}): ModelOutput => ({
  reply: "ok",
  actions,
  draft: null,
  choices: [],
  ...extra,
});

describe("buildProposals", () => {
  it("drops references to people the model wasn't shown", () => {
    const res = buildProposals(out([{ type: "add_memories", person_id: "someone-else", memories: ["x"] }]), ctx());
    expect(res.proposals).toEqual([]);
    expect(res.dropped).toBe(1);
  });

  it("skips memories that are already saved", () => {
    const res = buildProposals(out([{ type: "add_memories", person_id: "a1", memories: ["loves tennis", "Started at Google (Oct 2026)"] }]), ctx());
    expect(res.proposals).toEqual([
      expect.objectContaining({ kind: "add_memories", personId: "a1", memories: ["Started at Google (Oct 2026)"] }),
    ]);
  });

  it("shows conflicting values instead of silently overwriting", () => {
    const res = buildProposals(
      out([{ type: "update_person", person_id: "a1", relationship: null, birthday: { month: 5, day: 12, year: null }, email: null, phone: null }]),
      ctx(),
    );
    const card = res.proposals[0];
    expect(card.kind).toBe("update_person");
    if (card.kind !== "update_person") return;
    expect(card.changes).toEqual([
      expect.objectContaining({ field: "birthday", from: { month: 5, day: 10, year: null }, fromLabel: "May 10", toLabel: "May 12" }),
    ]);
  });

  it("drops no-op updates", () => {
    const res = buildProposals(
      out([{ type: "update_person", person_id: "a1", relationship: "friend", birthday: { month: 5, day: 10, year: null }, email: null, phone: null }]),
      ctx(),
    );
    expect(res.proposals).toEqual([]);
  });

  it("offers a new person, a birthday reminder for them, and links a reminder to them", () => {
    const res = buildProposals(
      out([
        { type: "create_reminder", person_id: null, new_person_name: "David Kim", title: "Ask David about golf", note: null, kind: "follow_up", date: "2026-10-16", time: "09:00", recurrence: "none" },
        { type: "create_person", name: "David Kim", relationship: "Financial advisor", birthday: { month: 3, day: 2, year: null }, email: null, phone: null, memories: ["Loves golf", "Has two children"] },
      ]),
      ctx(),
    );
    expect(res.proposals.map((p) => p.kind)).toEqual(["create_person", "create_reminder", "create_reminder"]);
    const [personCard, ...reminders] = res.proposals;
    expect(reminders.every((r) => r.kind === "create_reminder" && r.personKey === personCard.key)).toBe(true);
    expect(reminders.map((r) => r.kind === "create_reminder" && r.reminderKind).sort()).toEqual(["birthday", "follow_up"]);
  });

  it("updates an existing person instead of creating a duplicate", () => {
    const res = buildProposals(
      out([{ type: "create_person", name: "anna smith", relationship: null, birthday: null, email: null, phone: null, memories: ["Wants to visit Italy"] }]),
      ctx(),
    );
    expect(res.proposals).toEqual([expect.objectContaining({ kind: "add_memories", personId: "a1" })]);
  });

  it("warns about similar names for a genuinely new person", () => {
    const res = buildProposals(
      out([{ type: "create_person", name: "Anna Brown", relationship: null, birthday: null, email: null, phone: null, memories: [] }]),
      ctx([]),
    );
    const card = res.proposals[0];
    expect(card.kind === "create_person" && card.similar.map((s) => s.id).sort()).toEqual(["a1", "a2"]);
  });

  it("rejects invalid or past reminders and impossible birthdays", () => {
    const res = buildProposals(
      out([
        { type: "create_reminder", person_id: "a1", new_person_name: null, title: "Old", note: null, kind: "custom", date: "2026-10-01", time: "09:00", recurrence: "none" },
        { type: "create_reminder", person_id: "a1", new_person_name: null, title: "Bad", note: null, kind: "custom", date: "2026-02-30", time: "09:00", recurrence: "none" },
        { type: "update_person", person_id: "a1", relationship: null, birthday: { month: 2, day: 31, year: null }, email: null, phone: null },
      ]),
      ctx(),
    );
    expect(res.proposals).toEqual([]);
    expect(res.dropped).toBe(2);
  });

  it("does not offer a birthday reminder that already exists", () => {
    const res = buildProposals(
      out([{ type: "create_reminder", person_id: "a1", new_person_name: null, title: "Anna's birthday", note: null, kind: "birthday", date: "2027-05-09", time: "09:00", recurrence: "yearly" }]),
      ctx([{ ...anna, hasBirthdayReminder: true }]),
    );
    expect(res.proposals).toEqual([]);
  });

  it("attaches drafts to known people only", () => {
    const res = buildProposals(out([], { draft: { person_id: "a1", text: "Hi Anna!" } }), ctx());
    expect(res.draft).toEqual({ personName: "Anna Smith", text: "Hi Anna!" });
    const unknown = buildProposals(out([], { draft: { person_id: "nope", text: "Hi" } }), ctx());
    expect(unknown.draft).toEqual({ personName: null, text: "Hi" });
  });
});

describe("historyMessages", () => {
  it("starts with the user, ends with the assistant, and merges same-role turns", () => {
    const h = historyMessages([
      { role: "assistant", text: "hello" },
      { role: "user", text: "a" },
      { role: "user", text: "b" },
      { role: "assistant", text: "c" },
      { role: "user", text: "unanswered" },
    ]);
    expect(h).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c" },
    ]);
  });
});

import { presentReminder } from "@/lib/reminders/present";
import { birthdayReminderAt } from "@/lib/dates";

describe("presentReminder", () => {
  const base = { id: "r", note: null, recurrence: "yearly", person: { id: "p", name: "Mom" } };
  it("says 'tomorrow' the day before a birthday and offers gift ideas", () => {
    const at = birthdayReminderAt(10, 12, NOW, TZ); // Oct 11 09:00 for an Oct 12 birthday
    const card = presentReminder({ ...base, title: "Mom's birthday", kind: "birthday", remind_at: at.toISOString() }, ["Loves flowers"], NOW, TZ);
    expect(card.headline).toBe("Mom's birthday is tomorrow");
    expect(card.when).toBe("Tomorrow · Oct 12");
    expect(card.context).toBe("Loves flowers");
    expect(card.action?.label).toBe("Gift ideas");
  });
  it("keeps far-away birthdays short", () => {
    const at = birthdayReminderAt(5, 12, NOW, TZ);
    const card = presentReminder({ ...base, title: "Anna's birthday", kind: "birthday", remind_at: at.toISOString() }, [], NOW, TZ);
    expect(card.headline).toBe("Anna's birthday");
    expect(card.when).toBe("May 12");
  });
});
