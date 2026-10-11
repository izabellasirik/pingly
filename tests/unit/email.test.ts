import { afterEach, describe, expect, it, vi } from "vitest";
import { resendSender } from "@/lib/email/resend";
import { reminderEmail } from "@/lib/email/reminder-email";
import { birthdayReminderAt, zonedToUtc } from "@/lib/dates";

afterEach(() => vi.unstubAllGlobals());

const email = { to: "me@example.com", subject: "s", html: "<p>h</p>", text: "t", idempotencyKey: "pingly-123" };

describe("resendSender", () => {
  it("posts to Resend with an idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resendSender({ apiKey: "re_key", from: "Pingly <hi@pingly.app>" })(email);
    expect(result).toEqual({ id: "re_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe("pingly-123");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Pingly <hi@pingly.app>", to: ["me@example.com"], subject: "s" });
  });

  it("throws (never reports success) when Resend rejects the email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 })));
    await expect(resendSender({ apiKey: "k", from: "f" })(email)).rejects.toThrow("Resend 403: domain not verified");
  });
});

describe("reminderEmail", () => {
  const tz = "America/New_York";
  const now = zonedToUtc("2026-02-14", "09:00", tz)!;
  it("words birthday reminders and escapes user text", () => {
    const e = reminderEmail({
      title: "Mom's birthday",
      note: "<b>flowers</b>",
      kind: "birthday",
      remindAt: birthdayReminderAt(2, 15, now, tz),
      timeZone: tz,
      appUrl: "https://pingly.app",
      now,
    });
    expect(e.subject).toBe("🎂 Mom's birthday is tomorrow");
    expect(e.html).toContain("&lt;b&gt;flowers&lt;/b&gt;");
    expect(e.html).not.toContain("<b>flowers</b>");
    expect(e.text).toContain("https://pingly.app");
  });
});
