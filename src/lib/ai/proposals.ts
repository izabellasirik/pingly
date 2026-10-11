import { formatMonthDay, parseDateOnly, parseTime, zonedToUtc } from "@/lib/dates";
import { birthdaySchema, personFieldsSchema } from "@/lib/validation";
import type { ModelAction, ModelOutput } from "./schema";
import type { BirthdayValue, FieldChange, PersonField, Proposal } from "./types";

export type KnownPerson = {
  id: string;
  name: string;
  relationship: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  birthday_year: number | null;
  email: string | null;
  phone: string | null;
  memories: string[];
  hasBirthdayReminder: boolean;
};

export type ProposalContext = {
  /** People whose details were given to the model. Only these may be referenced. */
  candidates: Map<string, KnownPerson>;
  /** All of the user's people (names only), to warn about likely duplicates. */
  allPeople: { id: string; name: string; relationship: string | null }[];
  now: Date;
  timeZone: string;
};

export type BuiltProposals = {
  proposals: Proposal[];
  draft: { personName: string | null; text: string } | null;
  choices: string[];
  /** Number of model actions that were invalid and dropped. */
  dropped: number;
  personIds: string[];
};

const MAX_MEMORIES = 20;

/**
 * Validates the model's suggestions against the user's real data and turns
 * them into confirmation cards. The model can only reference people it was
 * shown; anything else is dropped. Nothing here writes to the database.
 */
export function buildProposals(output: ModelOutput, ctx: ProposalContext): BuiltProposals {
  const proposals: Proposal[] = [];
  const personIds = new Set<string>();
  let dropped = 0;
  let seq = 0;
  const nextKey = (prefix: string) => `${prefix}${++seq}`;

  const newPeople = new Map<string, Extract<Proposal, { kind: "create_person" }>>();
  const memoryCards = new Map<string, Extract<Proposal, { kind: "add_memories" }>>();
  const birthdayFor = new Set<string>(); // person ids / keys with a birthday reminder card

  const addBirthdayReminderCard = (
    target: { personId: string } | { personKey: string },
    personName: string,
  ) => {
    const id = "personId" in target ? target.personId : target.personKey;
    if (birthdayFor.has(id)) return;
    birthdayFor.add(id);
    proposals.push({
      kind: "create_reminder",
      key: nextKey("r"),
      personId: "personId" in target ? target.personId : null,
      personKey: "personKey" in target ? target.personKey : null,
      personName,
      title: `${personName}'s birthday`,
      note: null,
      reminderKind: "birthday",
      date: "",
      time: "",
      recurrence: "yearly",
    });
  };

  // Create people first so reminders can reference them.
  const ordered = [...output.actions].sort((a, b) => order(a) - order(b));

  for (const action of ordered) {
    switch (action.type) {
      case "create_person": {
        const parsed = personFieldsSchema.safeParse({
          name: action.name,
          relationship: action.relationship,
          birthday: validBirthday(action.birthday),
          email: action.email,
          phone: action.phone,
        });
        if (!parsed.success) {
          dropped++;
          break;
        }
        const nameKey = parsed.data.name.toLowerCase();
        // An exact-name match among the people we showed the model means it
        // should have been an update. Treat it as one rather than duplicating.
        const existing = [...ctx.candidates.values()].find((p) => p.name.toLowerCase() === nameKey);
        if (existing) {
          const memories = cleanMemories(action.memories, existing.memories);
          if (memories.length) pushMemories(existing, memories);
          const b = parsed.data.birthday;
          const changes = fieldChanges(existing, {
            ...parsed.data,
            birthday: b ? { month: b.month, day: b.day, year: b.year ?? null } : null,
          });
          if (changes.length) {
            proposals.push({ kind: "update_person", key: nextKey("u"), personId: existing.id, personName: existing.name, changes });
            personIds.add(existing.id);
          }
          break;
        }
        if (newPeople.has(nameKey)) break;
        const firstName = nameKey.split(/\s+/)[0];
        const card: Extract<Proposal, { kind: "create_person" }> = {
          kind: "create_person",
          key: nextKey("p"),
          ...parsed.data,
          birthday: parsed.data.birthday
            ? { month: parsed.data.birthday.month, day: parsed.data.birthday.day, year: parsed.data.birthday.year ?? null }
            : null,
          memories: cleanMemories(action.memories, []),
          similar: ctx.allPeople
            .filter((p) => p.name.toLowerCase().split(/\s+/)[0] === firstName)
            .slice(0, 3),
        };
        newPeople.set(nameKey, card);
        proposals.push(card);
        if (card.birthday) addBirthdayReminderCard({ personKey: card.key }, card.name);
        break;
      }

      case "add_memories": {
        const person = ctx.candidates.get(action.person_id);
        if (!person) {
          dropped++;
          break;
        }
        const memories = cleanMemories(action.memories, person.memories);
        if (memories.length) pushMemories(person, memories);
        break;
      }

      case "update_person": {
        const person = ctx.candidates.get(action.person_id);
        if (!person) {
          dropped++;
          break;
        }
        const changes = fieldChanges(person, {
          relationship: action.relationship,
          birthday: validBirthday(action.birthday),
          email: action.email,
          phone: action.phone,
        });
        if (changes.length) {
          proposals.push({ kind: "update_person", key: nextKey("u"), personId: person.id, personName: person.name, changes });
          personIds.add(person.id);
          const bday = changes.find((c) => c.field === "birthday");
          if (bday && !person.hasBirthdayReminder) {
            addBirthdayReminderCard({ personId: person.id }, person.name);
          }
        }
        break;
      }

      case "create_reminder": {
        const card = reminderCard(action);
        if (card) proposals.push(card);
        else dropped++;
        break;
      }
    }
  }

  function pushMemories(person: KnownPerson, memories: string[]) {
    personIds.add(person.id);
    const card = memoryCards.get(person.id);
    if (card) {
      card.memories = cleanMemories([...card.memories, ...memories], person.memories);
      return;
    }
    const created: Extract<Proposal, { kind: "add_memories" }> = {
      kind: "add_memories",
      key: nextKey("m"),
      personId: person.id,
      personName: person.name,
      memories,
    };
    memoryCards.set(person.id, created);
    proposals.push(created);
  }

  function reminderCard(action: Extract<ModelAction, { type: "create_reminder" }>): Proposal | null {
    let personId: string | null = null;
    let personKey: string | null = null;
    let personName: string | null = null;

    if (action.person_id) {
      const person = ctx.candidates.get(action.person_id);
      if (!person) return null;
      personId = person.id;
      personName = person.name;
      personIds.add(person.id);
    } else if (action.new_person_name?.trim()) {
      const name = action.new_person_name.trim().slice(0, 120);
      let created = newPeople.get(name.toLowerCase());
      if (!created) {
        // The model referenced a new person without proposing them; offer to.
        created = {
          kind: "create_person",
          key: nextKey("p"),
          name,
          relationship: null,
          birthday: null,
          email: null,
          phone: null,
          memories: [],
          similar: ctx.allPeople.filter((p) => p.name.toLowerCase() === name.toLowerCase()).slice(0, 3),
        };
        newPeople.set(name.toLowerCase(), created);
        proposals.push(created);
      }
      personKey = created.key;
      personName = created.name;
    }

    if (action.kind === "birthday") {
      // Birthday reminders are computed from the saved birthday.
      if (personId) {
        const p = ctx.candidates.get(personId)!;
        if (p.hasBirthdayReminder) return null;
        if (!p.birthday_month || !p.birthday_day) return null;
        addBirthdayReminderCard({ personId }, p.name);
        return null;
      }
      if (personKey) {
        const created = [...newPeople.values()].find((p) => p.key === personKey);
        if (created?.birthday) addBirthdayReminderCard({ personKey }, created.name);
        return null;
      }
      return null;
    }

    const title = action.title.trim().slice(0, 160);
    if (!title || !parseDateOnly(action.date) || !parseTime(action.time)) return null;
    const at = zonedToUtc(action.date, action.time, ctx.timeZone);
    if (!at || at.getTime() < ctx.now.getTime() - 60_000) return null;

    return {
      kind: "create_reminder",
      key: nextKey("r"),
      personId,
      personKey,
      personName,
      title,
      note: action.note?.trim().slice(0, 500) || null,
      reminderKind: action.kind,
      date: action.date,
      time: action.time,
      recurrence: action.recurrence,
    };
  }

  let draft: BuiltProposals["draft"] = null;
  if (output.draft?.text.trim()) {
    const person = output.draft.person_id ? ctx.candidates.get(output.draft.person_id) : undefined;
    if (person) personIds.add(person.id);
    draft = { personName: person?.name ?? null, text: output.draft.text.trim().slice(0, 4000) };
  }

  const choices = output.choices
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.length <= 80)
    .slice(0, 3);

  return {
    proposals: sortForDisplay(proposals),
    draft,
    choices,
    dropped,
    personIds: [...personIds],
  };
}

function order(a: ModelAction): number {
  return a.type === "create_person" ? 0 : a.type === "create_reminder" ? 2 : 1;
}

/** People first, then details, then reminders — the order they must be saved. */
function sortForDisplay(proposals: Proposal[]): Proposal[] {
  const rank = { create_person: 0, update_person: 1, add_memories: 2, create_reminder: 3 } as const;
  return proposals
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank[a.p.kind] - rank[b.p.kind] || a.i - b.i)
    .map(({ p }) => p);
}

function validBirthday(b: { month: number; day: number; year: number | null } | null) {
  if (!b) return null;
  const parsed = birthdaySchema.safeParse(b);
  return parsed.success ? { month: parsed.data.month, day: parsed.data.day, year: parsed.data.year ?? null } : null;
}

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ");
}

export function cleanMemories(memories: string[], existing: string[]): string[] {
  const seen = new Set(existing.map(normalize));
  const out: string[] = [];
  for (const m of memories) {
    const text = m.trim().replace(/\s+/g, " ").slice(0, 500);
    const key = normalize(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_MEMORIES) break;
  }
  return out;
}

const FIELD_LABEL: Record<PersonField, string> = {
  relationship: "Relationship",
  birthday: "Birthday",
  email: "Email",
  phone: "Phone",
};

function fieldChanges(
  person: KnownPerson,
  proposed: {
    relationship?: string | null;
    birthday?: BirthdayValue | null;
    email?: string | null;
    phone?: string | null;
  },
): FieldChange[] {
  const changes: FieldChange[] = [];
  const text = (field: "relationship" | "email" | "phone", max: number) => {
    const raw = proposed[field]?.trim();
    if (!raw) return;
    const value = raw.slice(0, max);
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
    const current = person[field];
    if (current && current.toLowerCase() === value.toLowerCase()) return;
    changes.push({ field, from: current, to: value, fromLabel: current, toLabel: value });
  };
  text("relationship", 60);
  if (proposed.birthday) {
    const b = proposed.birthday;
    const current =
      person.birthday_month && person.birthday_day
        ? { month: person.birthday_month, day: person.birthday_day, year: person.birthday_year ?? null }
        : null;
    const same = current && current.month === b.month && current.day === b.day && (b.year == null || b.year === current.year);
    if (!same) {
      changes.push({
        field: "birthday",
        from: current,
        to: { month: b.month, day: b.day, year: b.year ?? current?.year ?? null },
        fromLabel: current ? formatMonthDay(current.month, current.day, current.year) : null,
        toLabel: formatMonthDay(b.month, b.day, b.year ?? current?.year ?? null),
      });
    }
  }
  text("email", 254);
  text("phone", 40);
  return changes;
}

export { FIELD_LABEL };
