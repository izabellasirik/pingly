export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Same key → Resend delivers at most once (within 24h), even across retries. */
  idempotencyKey: string;
};

export type EmailSender = (email: OutgoingEmail) => Promise<{ id: string }>;

export function resendSender(config: { apiKey: string; from: string }): EmailSender {
  return async (email) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) {
      throw new Error(`Resend ${res.status}: ${body.message ?? "no message id returned"}`);
    }
    return { id: body.id };
  };
}
