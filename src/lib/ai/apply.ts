import "server-only";
import { z } from "zod";
import type { CurrentUser } from "@/lib/auth";
import {
  addMemories,
  createPerson,
  createReminder,
  ensureBirthdayReminder,
  updatePerson,
  type Result,
} from "@/lib/mutations";
import { birthdaySchema, dateString, memorySchema, personFieldsSchema, timeString } from "@/lib/validation";

// A confirmed card comes back from the browser, so it's untrusted input and is
// validated like any form. Ownership is enforced by RLS and composite keys.

const birthdayValue = z.object({ month: z.number(), day: z.number(), year: z.number().nullable() });
const fieldValue = z.union([z.string(), birthdayValue]).nullable();

const ProposalInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create_person"),
    name: z.string(),
    relationship: z.string().nullable(),
    birthday: birthdayValue.nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    memories: z.array(memorySchema).max(20),
  }),
  z.object({
    kind: z.literal("add_memories"),
    personId: z.uuid(),
    memories: z.array(memorySchema).min(1).max(20),
  }),
  z.object({
    kind: z.literal("update_person"),
    personId: z.uuid(),
    changes: z
      .array(
        z.object({
          field: z.enum(["relationship", "birthday", "email", "phone"]),
          from: fieldValue,
          to: z.union([z.string(), birthdayValue]),
        }),
      )
      .min(1)
      .max(4),
  }),
  z.object({
    kind: z.literal("create_reminder"),
    personId: z.uuid().nullable(),
    title: z.string().trim().min(1).max(160),
    note: z.string().trim().max(500).nullable(),
    reminderKind: z.enum(["birthday", "follow_up", "check_in", "custom"]),
    date: z.string(),
    time: z.string(),
    recurrence: z.enum(["none", "yearly"]),
  }),
]);

export type ApplyResult = Result<{ personId: string | null }>;

export async function applyProposal(user: CurrentUser, raw: unknown): Promise<ApplyResult> {
  const parsed = ProposalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "This suggestion is no longer valid." };
  const p = parsed.data;

  switch (p.kind) {
    case "create_person": {
      const fields = personFieldsSchema.safeParse(p);
      if (!fields.success) return { ok: false, error: fields.error.issues[0]?.message ?? "Check the details." };
      // Birthday reminders are offered as their own card, so don't add one here.
      const res = await createPerson(user, fields.data, { memories: p.memories });
      return res.ok ? { ok: true, data: { personId: res.data.id } } : res;
    }

    case "add_memories": {
      const res = await addMemories(user, p.personId, p.memories);
      return res.ok ? { ok: true, data: { personId: p.personId } } : res;
    }

    case "update_person": {
      const changes: Record<string, unknown> = {};
      const expected: Record<string, unknown> = {};
      for (const c of p.changes) {
        if (c.field === "birthday") {
          const b = birthdaySchema.safeParse(c.to);
          if (!b.success) return { ok: false, error: "That birthday isn't a real date." };
          changes.birthday = { month: b.data.month, day: b.data.day, year: b.data.year ?? null };
        } else {
          if (typeof c.to !== "string") return { ok: false, error: "This suggestion is no longer valid." };
          changes[c.field] = c.to;
        }
        expected[c.field] = c.from;
      }
      const validated = personFieldsSchema.partial().safeParse(changes);
      if (!validated.success) return { ok: false, error: validated.error.issues[0]?.message ?? "Check the details." };
      const res = await updatePerson(user, p.personId, validated.data, expected);
      return res.ok ? { ok: true, data: { personId: p.personId } } : res;
    }

    case "create_reminder": {
      if (p.reminderKind === "birthday") {
        if (!p.personId) return { ok: false, error: "Save the person first." };
        const res = await ensureBirthdayReminder(user, p.personId);
        return res.ok ? { ok: true, data: { personId: p.personId } } : res;
      }
      if (!dateString.safeParse(p.date).success || !timeString.safeParse(p.time).success) {
        return { ok: false, error: "Pick a valid date and time." };
      }
      const res = await createReminder(user, {
        personId: p.personId,
        title: p.title,
        note: p.note,
        kind: p.reminderKind,
        date: p.date,
        time: p.time,
        recurrence: p.recurrence,
      });
      return res.ok ? { ok: true, data: { personId: p.personId } } : res;
    }
  }
}
