import "server-only";

import {
  SUPABASE_PUBLIC_KEY_VARS,
  SUPABASE_SECRET_KEY_VARS,
  SUPABASE_URL_VARS,
  getSupabasePublicKey,
  getSupabaseSecretKey,
  getSupabaseUrl,
} from "@/lib/config";

function required(value: string | undefined, names: string[]): string {
  if (!value) {
    throw new Error(`Missing environment variable ${names[0]}. Open /setup or see README.md → "Environment variables".`);
  }
  return value;
}

export const supabaseUrl = () => required(getSupabaseUrl(), SUPABASE_URL_VARS);
export const supabasePublishableKey = () => required(getSupabasePublicKey(), SUPABASE_PUBLIC_KEY_VARS);
export const supabaseSecretKey = () => required(getSupabaseSecretKey(), SUPABASE_SECRET_KEY_VARS);

export function siteUrl(): string {
  return (process.env["APP_URL"] || "http://localhost:3000").replace(/\/$/, "");
}

/** AI features need an Anthropic API key on the server. */
export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  return process.env.PINGLY_AI_MODEL || "claude-opus-5-5";
}

/** Email reminders need a Resend API key and a verified sender address. */
export function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}
