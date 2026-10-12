import "server-only";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/config";

export type DatabaseStatus =
  | { ok: true }
  | { ok: false; problem: "not_configured" | "unreachable" | "bad_key" | "no_tables" | "unknown"; detail?: string };

/** Can the server reach Supabase with the configured key, and is the schema applied? */
export async function checkDatabase(): Promise<DatabaseStatus> {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return { ok: false, problem: "not_configured" };
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { ok: false, problem: "unreachable" };
  }
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (res.status === 401 || res.status === 403) {
    // RLS-protected tables answer 200 with no rows; 401 means the key itself was rejected.
    return body.code === "42501" ? { ok: true } : { ok: false, problem: "bad_key" };
  }
  if (body.code === "PGRST205" || body.code === "42P01" || res.status === 404) return { ok: false, problem: "no_tables" };
  return { ok: false, problem: "unknown", detail: `${res.status} ${body.code ?? ""}`.trim() };
}
