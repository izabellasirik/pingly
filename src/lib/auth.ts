import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Verifies the session server-side (getClaims validates the JWT) once per
 * request. Returns null when signed out.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Everything signed-in depends on the current time (session expiry, "today",
  // due reminders), so render it per request rather than prerendering it.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub, email: String(data.claims.email ?? ""), supabase };
});

/** For pages and actions that need a user: redirects to /login otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
