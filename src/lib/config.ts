// Runtime configuration, shared by the proxy and server code.
//
// Values are read with a computed key (`process.env[name]`) so Next.js never
// inlines them at build time: changing an environment variable on your host
// takes effect on the next request, without a rebuild. Pingly only talks to
// Supabase from the server, so nothing here needs to reach the browser.

function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

// Several names are accepted so the variables created by Supabase's Vercel
// integration (and older "anon"/"service_role" naming) work unchanged.
export const SUPABASE_URL_VARS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
export const SUPABASE_PUBLIC_KEY_VARS = [
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
export const SUPABASE_SECRET_KEY_VARS = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

export const getSupabaseUrl = () => read(...SUPABASE_URL_VARS);
export const getSupabasePublicKey = () => read(...SUPABASE_PUBLIC_KEY_VARS);
export const getSupabaseSecretKey = () => read(...SUPABASE_SECRET_KEY_VARS);

export type ConfigCheck = { label: string; vars: string[]; ok: boolean; required: boolean; purpose: string; needsAll?: boolean };

/** What's configured — names only, never values. */
export function configChecks(): ConfigCheck[] {
  return [
    { label: "Supabase URL", vars: SUPABASE_URL_VARS, ok: !!getSupabaseUrl(), required: true, purpose: "Your Supabase project" },
    { label: "Supabase publishable key", vars: SUPABASE_PUBLIC_KEY_VARS, ok: !!getSupabasePublicKey(), required: true, purpose: "Sign-in and your data (limited by Row Level Security)" },
    { label: "Supabase secret key", vars: SUPABASE_SECRET_KEY_VARS, ok: !!getSupabaseSecretKey(), required: true, purpose: "Reminder emails and account deletion (server-only)" },
    { label: "App URL", vars: ["APP_URL"], ok: !!read("APP_URL"), required: true, purpose: "Links in sign-up, password-reset and reminder emails" },
    { label: "Cron secret", vars: ["CRON_SECRET"], ok: !!read("CRON_SECRET"), required: false, purpose: "Lets your scheduler run the reminder job" },
    { label: "Anthropic API key", vars: ["ANTHROPIC_API_KEY"], ok: !!read("ANTHROPIC_API_KEY"), required: false, purpose: "Ask AI" },
    { label: "Resend email", vars: ["RESEND_API_KEY", "REMINDER_EMAIL_FROM"], ok: !!read("RESEND_API_KEY") && !!read("REMINDER_EMAIL_FROM"), required: false, purpose: "Reminder emails", needsAll: true },
  ];
}

/** Without these, nothing can work — the app shows /setup instead of crashing. */
export function hasRequiredSupabaseConfig(): boolean {
  return !!getSupabaseUrl() && !!getSupabasePublicKey();
}
