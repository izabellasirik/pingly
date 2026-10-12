import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { configChecks } from "@/lib/config";
import { checkDatabase, type DatabaseStatus } from "@/lib/setup-check";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <Suspense fallback={<p className="text-[15px] text-muted">Checking configuration…</p>}>
      <SetupStatus />
    </Suspense>
  );
}

const DB_MESSAGE: Record<Exclude<DatabaseStatus, { ok: true }>["problem"], string> = {
  not_configured: "Waiting for the Supabase URL and key.",
  unreachable: "Can't reach Supabase at the configured URL. Check the URL, and that the project isn't paused.",
  bad_key: "Supabase rejected the publishable key. Copy it again from Project Settings → API Keys.",
  no_tables: "Connected, but Pingly's tables don't exist yet. Apply the migrations in supabase/migrations (e.g. `supabase db push`).",
  unknown: "Supabase answered with an unexpected error.",
};

async function SetupStatus() {
  // Configuration is read at request time, so changes apply without a rebuild.
  await connection();
  const checks = configChecks();
  const db = await checkDatabase();
  const requiredOk = checks.every((c) => !c.required || c.ok) && db.ok;

  if (requiredOk) {
    // Fully configured: don't reveal configuration details to visitors.
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold">Pingly is set up ✨</h1>
        <Link href="/" className="btn-primary mt-5">
          Open Pingly
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Almost there</h1>
      <p className="mt-2 text-[15px] text-muted">
        Pingly needs a few settings on the server before it can run. Add the missing environment variables on your
        host, then reload this page — no rebuild needed.
      </p>
      <ul className="mt-5 space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-3 text-[14px]">
            <span aria-hidden className={c.ok ? "text-success" : c.required ? "text-danger" : "text-muted"}>
              {c.ok ? "✓" : c.required ? "✗" : "○"}
            </span>
            <span>
              <span className="font-semibold">{c.label}</span>
              {!c.required && <span className="text-muted"> (optional)</span>}
              <span className="block text-muted">{c.purpose}</span>
              {!c.ok && <code className="block text-[12px] text-ink-2">{c.vars.join(c.needsAll ? " and " : " or ")}</code>}
            </span>
          </li>
        ))}
        <li className="flex gap-3 text-[14px]">
          <span aria-hidden className={db.ok ? "text-success" : "text-danger"}>
            {db.ok ? "✓" : "✗"}
          </span>
          <span>
            <span className="font-semibold">Database</span>
            <span className="block text-muted">{db.ok ? "Connected, tables ready." : DB_MESSAGE[db.problem]}</span>
          </span>
        </li>
      </ul>
      <p className="mt-5 text-[13px] text-muted">The full list is in README.md → “Environment variables”.</p>
    </div>
  );
}
