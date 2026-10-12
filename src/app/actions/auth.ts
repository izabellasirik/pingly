"use server";

import { redirect } from "next/navigation";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { isValidTimeZone } from "@/lib/dates";
import { requireUser } from "@/lib/auth";
import type { FormState } from "./types";

const UNREACHABLE = "Couldn't reach Pingly's server. Please try again in a moment.";

/** Network failures and outages must not look like a wrong password. */
function isOutage(error: { status?: number }): boolean {
  return isAuthRetryableFetchError(error) || !error.status || error.status >= 500;
}

const email = z.email("Enter a valid email.").trim().toLowerCase();
const password = z.string().min(8, "Use at least 8 characters.").max(72);

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (isOutage(error)) return { error: UNREACHABLE };
    return {
      error:
        error.code === "email_not_confirmed"
          ? "Please confirm your email first — check your inbox."
          : "That email and password don't match.",
    };
  }
  redirect("/");
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ name: z.string().trim().max(80), email, password })
    .safeParse({ name: form.get("name") ?? "", email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tz = String(form.get("timezone") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name, timezone: isValidTimeZone(tz) ? tz : "UTC" },
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
    },
  });
  if (error) {
    if (isOutage(error)) return { error: UNREACHABLE };
    if (error.code === "weak_password") return { error: "Choose a stronger password." };
    if (error.code === "user_already_exists") return { error: "That email already has an account. Try logging in." };
    console.error("[pingly] sign-up failed:", error.code, error.message);
    return { error: "Couldn't create your account. Please try again." };
  }
  if (data.session) redirect("/");
  return { ok: true, message: "Check your email to confirm your account, then log in." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error && isOutage(error)) return { error: UNREACHABLE };
  // Same answer either way, so this can't be used to discover accounts.
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = password.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const user = await requireUser();
  const { error } = await user.supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Couldn't update your password. Try a different one." };
  redirect("/");
}
