/**
 * Data isolation: one user can never read, change, or link to another
 * user's data — enforced by Row Level Security and composite foreign keys in
 * the real database, independently of the app code.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let alice: TestUser;
let bob: TestUser;
let alicePersonId: string;
let aliceMemoryId: string;
let aliceReminderId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(), createTestUser("Europe/Paris")]);
  const { data: person, error } = await alice.client
    .from("people")
    .insert({ name: "Anna Smith", relationship: "Friend", email: "anna@example.com" })
    .select()
    .single();
  if (error) throw error;
  alicePersonId = person.id;
  const { data: memory } = await alice.client
    .from("memories")
    .insert({ person_id: person.id, content: "Loves tennis" })
    .select()
    .single();
  aliceMemoryId = memory!.id;
  const { data: reminder } = await alice.client
    .from("reminders")
    .insert({ person_id: person.id, title: "Call Anna", remind_at: new Date(Date.now() - 60_000).toISOString() })
    .select()
    .single();
  aliceReminderId = reminder!.id;
  await adminClient()
    .from("reminder_notifications")
    .insert({ reminder_id: aliceReminderId, user_id: alice.id, occurrence_at: reminder!.remind_at, status: "sent" });
});

afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
});

describe("reading", () => {
  it("owner sees their own data", async () => {
    const { data } = await alice.client.from("people").select("id");
    expect(data!.map((p) => p.id)).toContain(alicePersonId);
  });

  it("another user sees none of it, even by id", async () => {
    for (const table of ["people", "memories", "reminders", "reminder_notifications"] as const) {
      const { data, error } = await bob.client.from(table).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const { data } = await bob.client.from("people").select("*").eq("id", alicePersonId);
    expect(data).toEqual([]);
  });

  it("another user cannot read the owner's profile", async () => {
    const { data } = await bob.client.from("profiles").select("*").eq("id", alice.id);
    expect(data).toEqual([]);
    const { data: own } = await bob.client.from("profiles").select("*");
    expect(own).toHaveLength(1);
    expect(own![0].id).toBe(bob.id);
    expect(own![0].timezone).toBe("Europe/Paris");
  });

  it("signed-out visitors can read nothing", async () => {
    const anon = anonClient();
    for (const table of ["people", "memories", "reminders", "profiles", "reminder_notifications"] as const) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? []).toEqual([]);
    }
  });
});

describe("writing", () => {
  it("another user cannot update or delete the owner's rows", async () => {
    const upd = await bob.client.from("people").update({ name: "Hacked" }, { count: "exact" }).eq("id", alicePersonId);
    expect(upd.count ?? 0).toBe(0);
    const del = await bob.client.from("memories").delete({ count: "exact" }).eq("id", aliceMemoryId);
    expect(del.count ?? 0).toBe(0);
    const rem = await bob.client.from("reminders").update({ status: "done", completed_at: new Date().toISOString() }, { count: "exact" }).eq("id", aliceReminderId);
    expect(rem.count ?? 0).toBe(0);

    const { data } = await alice.client.from("people").select("name").eq("id", alicePersonId).single();
    expect(data!.name).toBe("Anna Smith");
    const { data: m } = await alice.client.from("memories").select("id").eq("id", aliceMemoryId);
    expect(m).toHaveLength(1);
  });

  it("another user cannot create rows owned by the owner", async () => {
    const { error } = await bob.client.from("people").insert({ name: "Planted", user_id: alice.id });
    expect(error).not.toBeNull();
  });

  it("another user cannot attach memories or reminders to the owner's person", async () => {
    // As themselves: the composite foreign key rejects a person they don't own.
    const m1 = await bob.client.from("memories").insert({ person_id: alicePersonId, content: "x" });
    expect(m1.error?.code).toBe("23503");
    // Pretending to be the owner: RLS rejects it.
    const m2 = await bob.client.from("memories").insert({ person_id: alicePersonId, user_id: alice.id, content: "x" });
    expect(m2.error).not.toBeNull();
    const r = await bob.client
      .from("reminders")
      .insert({ person_id: alicePersonId, title: "x", remind_at: new Date().toISOString() });
    expect(r.error?.code).toBe("23503");
  });

  it("cannot move a row to another account", async () => {
    const { error } = await alice.client.from("people").update({ user_id: bob.id }).eq("id", alicePersonId);
    expect(error).not.toBeNull();
  });

  it("even the service role cannot link across accounts", async () => {
    const { error } = await adminClient()
      .from("memories")
      .insert({ person_id: alicePersonId, user_id: bob.id, content: "cross-link" });
    expect(error?.code).toBe("23503");
  });

  it("users cannot write the delivery log", async () => {
    const { error } = await alice.client
      .from("reminder_notifications")
      .insert({ reminder_id: aliceReminderId, user_id: alice.id, occurrence_at: new Date().toISOString() });
    expect(error).not.toBeNull();
    const upd = await alice.client.from("reminder_notifications").update({ status: "failed" }, { count: "exact" }).eq("reminder_id", aliceReminderId);
    expect(upd.error ?? upd.count === 0).toBeTruthy();
  });

  it("users can update only their own editable profile fields", async () => {
    const ok = await alice.client.from("profiles").update({ display_name: "Alice" }).eq("id", alice.id);
    expect(ok.error).toBeNull();
    const badTz = await alice.client.from("profiles").update({ timezone: "Mars/Olympus" }).eq("id", alice.id);
    expect(badTz.error).not.toBeNull();
    const other = await bob.client.from("profiles").update({ display_name: "x" }, { count: "exact" }).eq("id", alice.id);
    expect(other.count ?? 0).toBe(0);
    const created = await alice.client.from("profiles").update({ created_at: new Date(0).toISOString() }).eq("id", alice.id);
    expect(created.error).not.toBeNull();
  });
});

describe("account deletion", () => {
  it("deleting a user removes all of their data", async () => {
    const carol = await createTestUser();
    const { data: p } = await carol.client.from("people").insert({ name: "Temp" }).select().single();
    await carol.client.from("memories").insert({ person_id: p!.id, content: "gone soon" });
    await carol.client.from("reminders").insert({ person_id: p!.id, title: "x", remind_at: new Date().toISOString() });
    await deleteTestUser(carol);
    const admin = adminClient();
    for (const table of ["people", "memories", "reminders"] as const) {
      const { data } = await admin.from(table).select("id").eq("user_id", carol.id);
      expect(data).toEqual([]);
    }
    const { data: profile } = await admin.from("profiles").select("id").eq("id", carol.id);
    expect(profile).toEqual([]);
  });
});
