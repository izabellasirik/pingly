import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data";
import { emailConfig, isAIConfigured } from "@/lib/env";
import { DeleteAccountForm, SettingsForm } from "@/components/SettingsForm";
import { ListSkeleton } from "@/components/Skeletons";

export const metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="space-y-6 pt-2">
      <h1 className="text-[28px] font-bold tracking-tight">Account</h1>
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await requireUser();
  const profile = await getProfile(user);
  const emailReady = Boolean(emailConfig());
  return (
    <>
      <section className="card space-y-1 p-5 text-[15px]">
        <p className="text-muted">Signed in as</p>
        <p className="font-semibold">{user.email}</p>
        <p className="pt-2 text-[13px] text-muted">
          Time zone: {profile.timezone} (follows your device)
        </p>
      </section>

      <section className="card p-5">
        <SettingsForm displayName={profile.display_name ?? ""} emailReminders={profile.email_reminders} />
        {!emailReady && (
          <p className="mt-4 rounded-xl bg-accent-soft p-3 text-[13px]" role="status">
            Email delivery isn’t configured on this server yet, so reminders only appear in the app for now.
          </p>
        )}
        {!isAIConfigured() && (
          <p className="mt-2 rounded-xl bg-accent-soft p-3 text-[13px]" role="status">
            AI isn’t configured on this server yet.
          </p>
        )}
      </section>

      <section className="card p-5 text-[14px] leading-relaxed text-muted">
        <p className="font-semibold text-ink">Your privacy</p>
        <p className="mt-1">
          Only you can see your people and memories. When you use Ask AI, only the people your message is about are
          shared with the AI service to answer it — never your whole list, and never their phone or email. Nothing is
          used for advertising or to train models.
        </p>
      </section>

      <form action={signOut}>
        <button type="submit" className="btn-soft w-full">
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </form>

      <details className="card p-5">
        <summary className="cursor-pointer text-[15px] font-semibold text-danger">Delete account</summary>
        <div className="mt-4">
          <DeleteAccountForm />
        </div>
      </details>
    </>
  );
}
