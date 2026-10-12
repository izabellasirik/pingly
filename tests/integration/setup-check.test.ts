import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDatabase } from "@/lib/setup-check";
import { configChecks, hasRequiredSupabaseConfig } from "@/lib/config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

const respond = (status: number, body: object) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe("setup checks", () => {
  it("reports a healthy local database", async () => {
    expect(await checkDatabase()).toEqual({ ok: true });
  });

  // Local Supabase doesn't validate keys, so these model hosted responses.
  it("detects a rejected key (hosted response shape)", async () => {
    respond(401, { message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." });
    expect(await checkDatabase()).toMatchObject({ ok: false, problem: "bad_key" });
  });

  it("detects a database without Pingly's tables", async () => {
    respond(404, { code: "PGRST205", message: "Could not find the table 'public.profiles' in the schema cache" });
    expect(await checkDatabase()).toMatchObject({ ok: false, problem: "no_tables" });
  });

  it("detects an unreachable server", async () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:9";
    expect(await checkDatabase()).toMatchObject({ ok: false, problem: "unreachable" });
  });

  it("accepts alternative variable names and reads them at runtime", () => {
    for (const k of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) delete process.env[k];
    expect(hasRequiredSupabaseConfig()).toBe(false);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    expect(hasRequiredSupabaseConfig()).toBe(true);
    expect(configChecks().find((c) => c.label === "Supabase URL")?.ok).toBe(true);
  });
});
