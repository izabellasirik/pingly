import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/supabase/database.types";
import type { CurrentUser } from "@/lib/auth";

export const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function adminClient() {
  return createClient<Database>(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient() {
  return createClient<Database>(url(), publishable(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string; client: SupabaseClient<Database>; asCurrentUser: CurrentUser };

/** Creates a confirmed user and returns a client signed in as them (RLS applies). */
export async function createTestUser(timezone = "America/New_York"): Promise<TestUser> {
  const admin = adminClient();
  const email = `test-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { timezone, display_name: "Tester" },
  });
  if (error) throw error;
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return {
    id: data.user.id,
    email,
    client,
    asCurrentUser: { id: data.user.id, email, supabase: client as unknown as CurrentUser["supabase"] },
  };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (user) await adminClient().auth.admin.deleteUser(user.id);
}
