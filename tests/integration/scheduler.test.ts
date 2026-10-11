import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OutgoingEmail } from "@/lib/email/resend";
import { runDueReminders } from "@/lib/reminders/scheduler";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let alice: TestUser;
let bob: TestUser;
const db = adminClient();

function fakeSender(fail = false) {
  const sent: OutgoingEmail[] = [];
  const send = async (email: OutgoingEmail) => {
    if (fail) throw new Error("provider down");
    sent.push(email);
    return { id: `msg-${sent.length}` };
  };
  return { sent, send };
}

async function addReminder(user: TestUser, title: string, at: Date) {
  const { data, error } = await user.client.from("reminders").insert({ title, remind_at: at.toISOString() }).select().single();
  if (error) throw error;
  return data;
}

const run = (send: ReturnType<typeof fakeSender>["send"] | null, now = new Date()) =>
  runDueReminders({ db, send, now, appUrl: "http://localhost:3000" });

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
});
beforeEach(async () => {
  // Isolate each test: only the reminders it creates should be due.
  await db.from("reminders").delete().in("user_id", [alice.id, bob.id]);
  await db.from("reminders").update({ status: "done", completed_at: new Date().toISOString() }).eq("status", "active").lte("remind_at", new Date().toISOString());
});

describe("reminder scheduler", () => {
  it("emails each due reminder exactly once, to its owner", async () => {
    await addReminder(alice, "Call Mom", new Date(Date.now() - 60_000));
    await addReminder(bob, "Follow up with John", new Date(Date.now() - 120_000));
    await addReminder(alice, "Not yet", new Date(Date.now() + 3_600_000));

    const s = fakeSender();
    const report = await run(s.send);
    expect(report).toMatchObject({ configured: true, sent: 2, failed: 0 });
    expect(s.sent.map((e) => [e.to, e.subject]).sort()).toEqual(
      [
        [alice.email, "🔔 Call Mom"],
        [bob.email, "🔔 Follow up with John"],
      ].sort(),
    );

    const again = await run(s.send);
    expect(again.sent).toBe(0);
    expect(again.alreadyHandled).toBe(2);
    expect(s.sent).toHaveLength(2);

    const { data: log } = await alice.client.from("reminder_notifications").select("status, provider_message_id");
    expect(log).toHaveLength(1);
    expect(log![0].status).toBe("sent");
  });

  it("concurrent runs still send only once", async () => {
    await addReminder(alice, "Race", new Date(Date.now() - 30_000));
    const s = fakeSender();
    const reports = await Promise.all([run(s.send), run(s.send), run(s.send)]);
    expect(reports.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(s.sent).toHaveLength(1);
  });

  it("does nothing and claims nothing when email isn't configured", async () => {
    const r = await addReminder(alice, "Unconfigured", new Date(Date.now() - 30_000));
    const report = await run(null);
    expect(report).toMatchObject({ configured: false, sent: 0 });
    expect(report.due).toBeGreaterThanOrEqual(1);
    const { data } = await db.from("reminder_notifications").select("id").eq("reminder_id", r.id);
    expect(data).toEqual([]);
    // Once configured, it is delivered.
    const s = fakeSender();
    expect((await run(s.send)).sent).toBe(1);
  });

  it("records failures and retries them later", async () => {
    const r = await addReminder(alice, "Flaky", new Date(Date.now() - 30_000));
    const failing = fakeSender(true);
    expect((await run(failing.send)).failed).toBe(1);
    const { data: failed } = await db.from("reminder_notifications").select("status, attempts, error").eq("reminder_id", r.id).single();
    expect(failed).toMatchObject({ status: "failed", attempts: 1 });

    const s = fakeSender();
    expect((await run(s.send)).sent).toBe(0); // too soon to retry
    const report = await run(s.send, new Date(Date.now() + 11 * 60_000));
    expect(report.sent).toBe(1);
    const { data: sent } = await db.from("reminder_notifications").select("status, attempts").eq("reminder_id", r.id).single();
    expect(sent).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("respects the email_reminders setting", async () => {
    await bob.client.from("profiles").update({ email_reminders: false }).eq("id", bob.id);
    await addReminder(bob, "Quiet", new Date(Date.now() - 30_000));
    const s = fakeSender();
    const report = await run(s.send);
    expect(report.skipped).toBe(1);
    expect(s.sent).toHaveLength(0);
    await bob.client.from("profiles").update({ email_reminders: true }).eq("id", bob.id);
  });

  it("does not email stale reminders from long ago", async () => {
    await addReminder(alice, "Ancient", new Date(Date.now() - 5 * 86_400_000));
    const s = fakeSender();
    await run(s.send);
    expect(s.sent.find((e) => e.subject.includes("Ancient"))).toBeUndefined();
  });

  it("a rescheduled reminder is emailed again at its new time", async () => {
    const r = await addReminder(alice, "Snoozed", new Date(Date.now() - 30_000));
    const s = fakeSender();
    await run(s.send);
    await alice.client.from("reminders").update({ remind_at: new Date(Date.now() + 60_000).toISOString() }).eq("id", r.id);
    await run(s.send);
    expect(s.sent.filter((e) => e.subject.includes("Snoozed"))).toHaveLength(1);
    await run(s.send, new Date(Date.now() + 120_000));
    expect(s.sent.filter((e) => e.subject.includes("Snoozed"))).toHaveLength(2);
  });
});
