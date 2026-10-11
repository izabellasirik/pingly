import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { safeTimeZone } from "@/lib/dates";
import type { EmailSender } from "@/lib/email/resend";
import { reminderEmail } from "@/lib/email/reminder-email";

type Db = SupabaseClient<Database>;

/** Reminders older than this when first seen are not emailed (e.g. after downtime). */
export const DELIVERY_WINDOW_MS = 48 * 3_600_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 10 * 60_000;
const STUCK_PENDING_MS = 15 * 60_000;
const BATCH = 100;

export type JobReport = {
  configured: boolean;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  alreadyHandled: number;
};

type DueReminder = Pick<
  Database["public"]["Tables"]["reminders"]["Row"],
  "id" | "user_id" | "title" | "note" | "kind" | "remind_at"
>;

/**
 * Sends email for every reminder that has come due. Safe to run as often as
 * you like and concurrently: each (reminder, occurrence) is claimed with a
 * unique insert before sending, so it is emailed at most once.
 *
 * Runs with the service-role client because it works across all users.
 */
export async function runDueReminders(params: {
  db: Db;
  send: EmailSender | null;
  now: Date;
  appUrl: string;
}): Promise<JobReport> {
  const { db, send, now, appUrl } = params;
  const report: JobReport = { configured: Boolean(send), due: 0, sent: 0, failed: 0, skipped: 0, alreadyHandled: 0 };

  const { data: due, error } = await db
    .from("reminders")
    .select("id, user_id, title, note, kind, remind_at")
    .eq("status", "active")
    .lte("remind_at", now.toISOString())
    .gte("remind_at", new Date(now.getTime() - DELIVERY_WINDOW_MS).toISOString())
    .order("remind_at")
    .limit(BATCH);
  if (error) throw new Error(`Could not load due reminders: ${error.message}`);
  report.due = due.length;

  // Without an email provider we don't claim anything, so reminders still go
  // out (within the window) once email is configured. Nothing is marked sent.
  if (!send) return report;

  const users = new UserCache(db);

  for (const reminder of due) {
    const { data: claimed, error: claimError } = await db
      .from("reminder_notifications")
      .upsert(
        { reminder_id: reminder.id, user_id: reminder.user_id, occurrence_at: reminder.remind_at, channel: "email", status: "pending" },
        { onConflict: "reminder_id,occurrence_at,channel", ignoreDuplicates: true },
      )
      .select("id, attempts");
    if (claimError) throw new Error(`Could not claim reminder: ${claimError.message}`);
    if (!claimed || claimed.length === 0) {
      report.alreadyHandled++;
      continue;
    }
    await deliver(db, send, users, reminder, claimed[0], now, appUrl, report);
  }

  await retryFailed(db, send, users, now, appUrl, report);
  return report;
}

async function deliver(
  db: Db,
  send: EmailSender,
  users: UserCache,
  reminder: DueReminder,
  notification: { id: string; attempts: number },
  now: Date,
  appUrl: string,
  report: JobReport,
) {
  const user = await users.get(reminder.user_id);
  if (!user || !user.email || !user.emailReminders) {
    await db
      .from("reminder_notifications")
      .update({ status: "skipped", error: !user?.email ? "no email address" : "email reminders turned off" })
      .eq("id", notification.id);
    report.skipped++;
    return;
  }
  const email = reminderEmail({
    title: reminder.title,
    note: reminder.note,
    kind: reminder.kind,
    remindAt: new Date(reminder.remind_at),
    timeZone: user.timezone,
    appUrl,
    now,
  });
  try {
    const { id } = await send({ to: user.email, ...email, idempotencyKey: `pingly-${notification.id}` });
    await db
      .from("reminder_notifications")
      .update({ status: "sent", provider_message_id: id, attempts: notification.attempts + 1, error: null })
      .eq("id", notification.id);
    report.sent++;
  } catch (err) {
    await db
      .from("reminder_notifications")
      .update({ status: "failed", attempts: notification.attempts + 1, error: String(err).slice(0, 500) })
      .eq("id", notification.id);
    report.failed++;
  }
}

/** Retries failed sends, and sends that were claimed but never finished. */
async function retryFailed(db: Db, send: EmailSender, users: UserCache, now: Date, appUrl: string, report: JobReport) {
  const { data: candidates } = await db
    .from("reminder_notifications")
    .select("id, reminder_id, status, attempts, occurrence_at, updated_at")
    .in("status", ["failed", "pending"])
    .lt("attempts", MAX_ATTEMPTS)
    .gte("occurrence_at", new Date(now.getTime() - DELIVERY_WINDOW_MS).toISOString())
    .limit(BATCH);
  for (const n of candidates ?? []) {
    const age = now.getTime() - new Date(n.updated_at).getTime();
    if (n.status === "failed" && age < RETRY_AFTER_MS) continue;
    if (n.status === "pending" && age < STUCK_PENDING_MS) continue;

    const { data: reminder } = await db
      .from("reminders")
      .select("id, user_id, title, note, kind, remind_at, status")
      .eq("id", n.reminder_id)
      .maybeSingle();
    // Completed or rescheduled since: this occurrence no longer needs an email.
    if (!reminder || reminder.status !== "active" || new Date(reminder.remind_at).getTime() !== new Date(n.occurrence_at).getTime()) {
      await db.from("reminder_notifications").update({ status: "skipped", error: "reminder changed" }).eq("id", n.id);
      continue;
    }
    // Re-claim atomically so concurrent runs don't both retry.
    const { data: reclaimed } = await db
      .from("reminder_notifications")
      .update({ status: "pending" })
      .eq("id", n.id)
      .eq("status", n.status)
      .eq("updated_at", n.updated_at)
      .select("id, attempts");
    if (!reclaimed?.length) continue;
    await deliver(db, send, users, reminder, reclaimed[0], now, appUrl, report);
  }
}

class UserCache {
  private cache = new Map<string, { email: string | null; timezone: string; emailReminders: boolean } | null>();
  constructor(private db: Db) {}

  async get(userId: string) {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    const [{ data: auth }, { data: profile }] = await Promise.all([
      this.db.auth.admin.getUserById(userId),
      this.db.from("profiles").select("timezone, email_reminders").eq("id", userId).maybeSingle(),
    ]);
    const value = auth?.user
      ? {
          email: auth.user.email ?? null,
          timezone: safeTimeZone(profile?.timezone),
          emailReminders: profile?.email_reminders ?? true,
        }
      : null;
    this.cache.set(userId, value);
    return value;
  }
}
