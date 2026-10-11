import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMemories,
  completeReminder,
  createPerson,
  createReminder,
  deletePerson,
  rescheduleReminder,
  updatePerson,
} from "@/lib/mutations";
import { applyProposal } from "@/lib/ai/apply";
import { utcToZonedParts, addDaysToDate } from "@/lib/dates";
import { createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

const TZ = "America/New_York";
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(TZ), createTestUser(TZ)]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
});

const tomorrow = () => addDaysToDate(utcToZonedParts(new Date(), TZ).date, 1);

describe("people and memories", () => {
  it("creates a person with memories and a yearly birthday reminder", async () => {
    const res = await createPerson(
      alice.asCurrentUser,
      { name: "Mom", relationship: "Mother", birthday: { month: 2, day: 15, year: null }, email: null, phone: null },
      { memories: ["Loves flowers", "Likes Italian restaurants"], birthdayReminder: true },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { data: memories } = await alice.client.from("memories").select("content").eq("person_id", res.data.id);
    expect(memories!.map((m) => m.content).sort()).toEqual(["Likes Italian restaurants", "Loves flowers"]);
    const { data: reminders } = await alice.client.from("reminders").select("*").eq("person_id", res.data.id);
    expect(reminders).toHaveLength(1);
    expect(reminders![0]).toMatchObject({ kind: "birthday", recurrence: "yearly", title: "Mom's birthday" });
    expect(utcToZonedParts(new Date(reminders![0].remind_at), TZ)).toMatchObject({ time: "09:00" });
    expect(utcToZonedParts(new Date(reminders![0].remind_at), TZ).date.slice(5)).toBe("02-14");
  });

  it("does not save duplicate memories", async () => {
    const p = await createPerson(alice.asCurrentUser, { name: "Dup Test", relationship: null, birthday: null, email: null, phone: null });
    if (!p.ok) throw new Error(p.error);
    expect((await addMemories(alice.asCurrentUser, p.data.id, ["Loves tennis"])).ok).toBe(true);
    const again = await addMemories(alice.asCurrentUser, p.data.id, ["loves tennis.", "Wants to visit Italy"]);
    expect(again).toEqual({ ok: true, data: { added: 1 } });
  });

  it("never overwrites a field that changed since the suggestion", async () => {
    const p = await createPerson(alice.asCurrentUser, { name: "Anna", relationship: null, birthday: { month: 5, day: 10, year: null }, email: null, phone: null });
    if (!p.ok) throw new Error(p.error);
    const stale = await updatePerson(alice.asCurrentUser, p.data.id, { birthday: { month: 5, day: 12, year: null } }, { birthday: null });
    expect(stale.ok).toBe(false);
    const { data } = await alice.client.from("people").select("birthday_day").eq("id", p.data.id).single();
    expect(data!.birthday_day).toBe(10);
    const fresh = await updatePerson(alice.asCurrentUser, p.data.id, { birthday: { month: 5, day: 12, year: null } }, { birthday: { month: 5, day: 10, year: null } });
    expect(fresh.ok).toBe(true);
  });

  it("one user's actions cannot touch another user's person", async () => {
    const p = await createPerson(alice.asCurrentUser, { name: "Private", relationship: null, birthday: null, email: null, phone: null });
    if (!p.ok) throw new Error(p.error);
    expect((await addMemories(bob.asCurrentUser, p.data.id, ["sneaky"])).ok).toBe(false);
    expect((await updatePerson(bob.asCurrentUser, p.data.id, { name: "Hacked" })).ok).toBe(false);
    expect((await deletePerson(bob.asCurrentUser, p.data.id)).ok).toBe(false);
    const r = await createReminder(bob.asCurrentUser, { personId: p.data.id, title: "x", note: null, kind: "custom", date: tomorrow(), time: "09:00", recurrence: "none" });
    expect(r.ok).toBe(false);
    // A confirmed AI card tampered to point at someone else's person.
    const tampered = await applyProposal(bob.asCurrentUser, { kind: "add_memories", personId: p.data.id, memories: ["sneaky"] });
    expect(tampered.ok).toBe(false);
    const { data } = await alice.client.from("memories").select("id").eq("person_id", p.data.id);
    expect(data).toEqual([]);
  });
});

describe("reminders", () => {
  it("creates a reminder at the right local time and prevents duplicates", async () => {
    const input = { personId: null, title: "Call Mom", note: null, kind: "custom" as const, date: tomorrow(), time: "18:00", recurrence: "none" as const };
    const first = await createReminder(alice.asCurrentUser, input);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(utcToZonedParts(new Date(first.data.remind_at), TZ)).toEqual({ date: tomorrow(), time: "18:00" });
    const second = await createReminder(alice.asCurrentUser, { ...input, title: " call mom " });
    expect(second).toEqual({ ok: false, error: "You already have this reminder." });
  });

  it("rejects reminders in the past", async () => {
    const res = await createReminder(alice.asCurrentUser, { personId: null, title: "Too late", note: null, kind: "custom", date: "2020-01-01", time: "09:00", recurrence: "none" });
    expect(res.ok).toBe(false);
  });

  it("completes a one-time reminder into history", async () => {
    const r = await createReminder(alice.asCurrentUser, { personId: null, title: "One-off", note: null, kind: "custom", date: tomorrow(), time: "10:00", recurrence: "none" });
    if (!r.ok) throw new Error(r.error);
    expect((await completeReminder(alice.asCurrentUser, r.data.id)).ok).toBe(true);
    const { data } = await alice.client.from("reminders").select("status, completed_at").eq("id", r.data.id).single();
    expect(data!.status).toBe("done");
    expect(data!.completed_at).not.toBeNull();
    // Completing twice is harmless.
    expect((await completeReminder(alice.asCurrentUser, r.data.id)).ok).toBe(true);
  });

  it("completing a yearly birthday reminder logs it and moves to next year", async () => {
    const p = await createPerson(
      alice.asCurrentUser,
      { name: "Yearly Pal", relationship: null, birthday: { month: 12, day: 1, year: null }, email: null, phone: null },
      { birthdayReminder: true },
    );
    if (!p.ok) throw new Error(p.error);
    const { data: before } = await alice.client.from("reminders").select("*").eq("person_id", p.data.id).single();
    const res = await completeReminder(alice.asCurrentUser, before!.id);
    expect(res.ok).toBe(true);
    const { data: after } = await alice.client.from("reminders").select("*").eq("person_id", p.data.id).order("remind_at");
    expect(after).toHaveLength(2);
    const [done, active] = after!;
    expect(done).toMatchObject({ status: "done", recurrence: "none", remind_at: before!.remind_at });
    expect(active).toMatchObject({ status: "active", id: before!.id });
    const yearBefore = Number(utcToZonedParts(new Date(before!.remind_at), TZ).date.slice(0, 4));
    expect(utcToZonedParts(new Date(active.remind_at), TZ).date).toBe(`${yearBefore + 1}-11-30`);
  });

  it("reschedules with presets and custom dates", async () => {
    const r = await createReminder(alice.asCurrentUser, { personId: null, title: "Snooze me", note: null, kind: "check_in", date: tomorrow(), time: "08:00", recurrence: "none" });
    if (!r.ok) throw new Error(r.error);
    const later = await rescheduleReminder(alice.asCurrentUser, r.data.id, { preset: "next_week" });
    expect(later.ok).toBe(true);
    const custom = await rescheduleReminder(alice.asCurrentUser, r.data.id, { date: addDaysToDate(tomorrow(), 3), time: "07:15" });
    expect(custom.ok).toBe(true);
    if (custom.ok) expect(utcToZonedParts(new Date(custom.data.remindAt), TZ)).toEqual({ date: addDaysToDate(tomorrow(), 3), time: "07:15" });
    expect((await rescheduleReminder(bob.asCurrentUser, r.data.id, { preset: "tomorrow" })).ok).toBe(false);
  });
});
