import Link from "next/link";
import { Suspense } from "react";
import { LoginNotice } from "@/components/LoginNotice";
import { signIn } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <Suspense>
        <LoginNotice />
      </Suspense>
      <h1 className="mb-5 text-xl font-semibold">Welcome back</h1>
      <AuthForm
        action={signIn}
        submitLabel="Log in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <div className="mt-5 flex justify-between text-[14px]">
        <Link href="/forgot" className="text-muted hover:text-ink">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-semibold text-accent">
          Create account
        </Link>
      </div>
    </>
  );
}
