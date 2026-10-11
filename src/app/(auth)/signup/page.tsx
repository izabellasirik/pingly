import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Create your account</h1>
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        withTimezone
        fields={[
          { name: "name", label: "Your first name", type: "text", autoComplete: "given-name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password", minLength: 8 },
        ]}
      />
      <p className="mt-5 text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent">
          Log in
        </Link>
      </p>
    </>
  );
}
