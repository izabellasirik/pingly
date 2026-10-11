import { timingSafeEqual } from "node:crypto";
import { emailConfig, siteUrl } from "@/lib/env";
import { resendSender } from "@/lib/email/resend";
import { runDueReminders } from "@/lib/reminders/scheduler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side reminder scheduler. Call it every few minutes from a cron
 * (Vercel Cron, Supabase pg_cron, GitHub Actions, …) with
 * `Authorization: Bearer $CRON_SECRET`. It doesn't depend on any browser.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = emailConfig();
  try {
    const report = await runDueReminders({
      db: createAdminClient(),
      send: config ? resendSender(config) : null,
      now: new Date(),
      appUrl: siteUrl(),
    });
    return Response.json({
      ...report,
      ...(report.configured
        ? {}
        : { warning: "Email is not configured (RESEND_API_KEY, REMINDER_EMAIL_FROM). No emails were sent." }),
    });
  } catch (error) {
    console.error("[pingly] reminder job failed:", error);
    return Response.json({ error: "Reminder job failed" }, { status: 500 });
  }
}

export const POST = GET;
