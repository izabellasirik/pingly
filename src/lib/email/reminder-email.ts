import { birthdayForReminder, formatTime, relativeDayLabel, utcToZonedParts } from "@/lib/dates";
import { KIND_EMOJI, type ReminderKind } from "@/lib/reminders/logic";

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function reminderEmail(params: {
  title: string;
  note: string | null;
  kind: string;
  remindAt: Date;
  timeZone: string;
  appUrl: string;
  now: Date;
}) {
  const { title, note, remindAt, timeZone, appUrl, now } = params;
  const kind = (["birthday", "follow_up", "check_in", "custom"].includes(params.kind) ? params.kind : "custom") as ReminderKind;
  const emoji = KIND_EMOJI[kind];
  let headline = title;
  if (kind === "birthday") {
    const day = relativeDayLabel(birthdayForReminder(remindAt, timeZone), now, timeZone);
    headline = `${title} is ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : `on ${day}`}`;
  }
  const { time } = utcToZonedParts(remindAt, timeZone);
  const subject = `${emoji} ${headline}`;
  const when = kind === "birthday" ? "" : `Due ${formatTime(time)}`;

  const text = [headline, note ?? "", when, "", `Open Pingly: ${appUrl}`].filter(Boolean).join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:20px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#78716c;padding-bottom:16px">Pingly reminder</td></tr>
<tr><td style="font-size:22px;font-weight:600;line-height:1.3;padding-bottom:8px">${emoji} ${escape(headline)}</td></tr>
${note ? `<tr><td style="font-size:15px;line-height:1.5;color:#44403c;padding-bottom:8px">${escape(note)}</td></tr>` : ""}
${when ? `<tr><td style="font-size:13px;color:#78716c;padding-bottom:8px">${when}</td></tr>` : ""}
<tr><td style="padding-top:16px"><a href="${escape(appUrl)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:999px">Open Pingly</a></td></tr>
</table>
<p style="font-size:12px;color:#a8a29e;margin-top:16px">You get these because email reminders are on in Pingly. Turn them off in Account.</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}
