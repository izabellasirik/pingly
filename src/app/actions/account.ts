"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FormState } from "./types";

export async function updateSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get("display_name") ?? "").trim().slice(0, 80);
  const { error } = await user.supabase
    .from("profiles")
    .update({ display_name: name || null, email_reminders: form.get("email_reminders") === "on" })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save your settings." };
  refresh();
  return { ok: true, message: "Saved" };
}

/** Keeps the profile's time zone in step with the user's device. */
export async function syncTimezoneAction(timeZone: string): Promise<void> {
  if (!isValidTimeZone(timeZone)) return;
  const user = await requireUser();
  await user.supabase.from("profiles").update({ timezone: timeZone }).eq("id", user.id).neq("timezone", timeZone);
}

/**
 * Permanently deletes the account. People, memories, reminders and the
 * delivery log are removed by ON DELETE CASCADE.
 */
export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: 'Type DELETE to confirm.' };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[pingly] account deletion failed:", error.message);
    return { error: "Couldn't delete your account. Please try again." };
  }
  await user.supabase.auth.signOut();
  redirect("/login?deleted=1");
}
